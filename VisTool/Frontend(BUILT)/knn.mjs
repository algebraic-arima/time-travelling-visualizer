import { __awaiter } from "tslib";
/* Copyright 2016 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
import * as tf from '../webapp/third_party/tfjs';
import { KMin } from './heap';
import * as vector from './vector';
import * as logging from './logging';
import * as util from './util';
/**
 * Optimal size for the height of the matrix when doing computation on the GPU
 * using WebGL. This was found experimentally.
 *
 * This also guarantees that for computing pair-wise distance for up to 10K
 * vectors, no more than 40MB will be allocated in the GPU. Without the
 * allocation limit, we can freeze the graphics of the whole OS.
 */
const OPTIMAL_GPU_BLOCK_SIZE = 256;
/** Id of message box used for knn gpu progress bar. */
const KNN_GPU_MSG_ID = 'knn-gpu';
/**
 * Returns the K nearest neighbors for each vector where the distance
 * computation is done on the GPU (WebGL) using cosine distance.
 *
 * @param dataPoints List of data points, where each data point holds an
 *   n-dimensional vector.
 * @param k Number of nearest neighbors to find.
 * @param accessor A method that returns the vector, given the data point.
 */
export function findKNNGPUCosine(dataPoints, k, accessor) {
    let N = dataPoints.length;
    let dim = accessor(dataPoints[0]).length;
    // The goal is to compute a large matrix multiplication A*A.T where A is of
    // size NxD and A.T is its transpose. This results in a NxN matrix which
    // could be too big to store on the GPU memory. To avoid memory overflow, we
    // compute multiple A*partial_A.T where partial_A is of size BxD (B is much
    // smaller than N). This results in storing only NxB size matrices on the GPU
    // at a given time.
    // A*A.T will give us NxN matrix holding the cosine distance between every
    // pair of points, which we sort using KMin data structure to obtain the
    // K nearest neighbors for each point.
    let typedArray = vector.toTypedArray(dataPoints, accessor);
    const bigMatrix = tf.tensor(typedArray, [N, dim]);
    let nearest = new Array(N);
    let numPieces = Math.ceil(N / OPTIMAL_GPU_BLOCK_SIZE);
    let M = Math.floor(N / numPieces);
    let modulo = N % numPieces;
    let offset = 0;
    let progress = 0;
    let progressDiff = 1 / (2 * numPieces);
    let piece = 0;
    function step(resolve) {
        let progressMsg = 'Finding nearest neighbors: ' + (progress * 100).toFixed() + '%';
        util
            .runAsyncTask(progressMsg, () => __awaiter(this, void 0, void 0, function* () {
            let B = piece < modulo ? M + 1 : M;
            let typedB = new Float32Array(B * dim);
            for (let i = 0; i < B; ++i) {
                let vector = accessor(dataPoints[offset + i]);
                for (let d = 0; d < dim; ++d) {
                    typedB[i * dim + d] = vector[d];
                }
            }
            const partialMatrix = tf.tensor(typedB, [dim, B]);
            const result = tf.matMul(bigMatrix, partialMatrix);
            const partial = yield result.array();
            partialMatrix.dispose();
            result.dispose();
            progress += progressDiff;
            for (let i = 0; i < B; i++) {
                let kMin = new KMin(k);
                let iReal = offset + i;
                for (let j = 0; j < N; j++) {
                    if (j === iReal) {
                        continue;
                    }
                    let cosDist = 1 - partial[j][i];
                    kMin.add(cosDist, { index: j, dist: cosDist });
                }
                nearest[iReal] = kMin.getMinKItems();
            }
            progress += progressDiff;
            offset += B;
            piece++;
        }), KNN_GPU_MSG_ID)
            .then(() => {
            if (piece < numPieces) {
                step(resolve);
            }
            else {
                logging.setModalMessage(null, KNN_GPU_MSG_ID);
                bigMatrix.dispose();
                resolve(nearest);
            }
        }, (error) => {
            // GPU failed. Reverting back to CPU.
            logging.setModalMessage(null, KNN_GPU_MSG_ID);
            let distFunc = (a, b, limit) => vector.cosDistNorm(a, b);
            findKNN(dataPoints, k, accessor, distFunc).then((nearest) => {
                resolve(nearest);
            });
        });
    }
    return new Promise((resolve) => step(resolve));
}
/**
 * Returns the K nearest neighbors for each vector where the distance
 * computation is done on the CPU using a user-specified distance method.
 *
 * @param dataPoints List of data points, where each data point holds an
 *   n-dimensional vector.
 * @param k Number of nearest neighbors to find.
 * @param accessor A method that returns the vector, given the data point.
 * @param dist Method that takes two vectors and a limit, and computes the
 *   distance between two vectors, with the ability to stop early if the
 *   distance is above the limit.
 */
export function findKNN(dataPoints, k, accessor, dist) {
    return util.runAsyncTask('Finding nearest neighbors...', () => {
        let N = dataPoints.length;
        let nearest = new Array(N);
        // Find the distances from node i.
        let kMin = new Array(N);
        for (let i = 0; i < N; i++) {
            kMin[i] = new KMin(k);
        }
        for (let i = 0; i < N; i++) {
            let a = accessor(dataPoints[i]);
            let kMinA = kMin[i];
            for (let j = i + 1; j < N; j++) {
                let kMinB = kMin[j];
                let limitI = kMinA.getSize() === k
                    ? kMinA.getLargestKey() || Number.MAX_VALUE
                    : Number.MAX_VALUE;
                let limitJ = kMinB.getSize() === k
                    ? kMinB.getLargestKey() || Number.MAX_VALUE
                    : Number.MAX_VALUE;
                let limit = Math.max(limitI, limitJ);
                let dist2ItoJ = dist(a, accessor(dataPoints[j]), limit);
                if (dist2ItoJ >= 0) {
                    kMinA.add(dist2ItoJ, { index: j, dist: dist2ItoJ });
                    kMinB.add(dist2ItoJ, { index: i, dist: dist2ItoJ });
                }
            }
        }
        for (let i = 0; i < N; i++) {
            nearest[i] = kMin[i].getMinKItems();
        }
        return nearest;
    });
}
/** Calculates the minimum distance between a search point and a rectangle. */
function minDist(point, x1, y1, x2, y2) {
    let x = point[0];
    let y = point[1];
    let dx1 = x - x1;
    let dx2 = x - x2;
    let dy1 = y - y1;
    let dy2 = y - y2;
    if (dx1 * dx2 <= 0) {
        // x is between x1 and x2
        if (dy1 * dy2 <= 0) {
            // (x,y) is inside the rectangle
            return 0; // return 0 as point is in rect
        }
        return Math.min(Math.abs(dy1), Math.abs(dy2));
    }
    if (dy1 * dy2 <= 0) {
        // y is between y1 and y2
        // We know it is already inside the rectangle
        return Math.min(Math.abs(dx1), Math.abs(dx2));
    }
    let corner;
    if (x > x2) {
        // Upper-right vs lower-right.
        corner = y > y2 ? [x2, y2] : [x2, y1];
    }
    else {
        // Upper-left vs lower-left.
        corner = y > y2 ? [x1, y2] : [x1, y1];
    }
    return Math.sqrt(vector.dist22D([x, y], corner));
}
/**
 * Returns the nearest neighbors of a particular point.
 *
 * @param dataPoints List of data points.
 * @param pointIndex The index of the point we need the nearest neighbors of.
 * @param k Number of nearest neighbors to search for.
 * @param accessor Method that maps a data point => vector (array of numbers).
 * @param distance Method that takes two vectors and returns their distance.
 */
export function findKNNofPoint(dataPoints, pointIndex, k, accessor, distance) {
    let kMin = new KMin(k);
    let a = accessor(dataPoints[pointIndex]);
    for (let i = 0; i < dataPoints.length; ++i) {
        if (i === pointIndex) {
            continue;
        }
        let b = accessor(dataPoints[i]);
        let dist = distance(a, b);
        kMin.add(dist, { index: i, dist: dist });
    }
    return kMin.getMinKItems();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia25uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vdGVuc29yYm9hcmQvcHJvamVjdG9yL2tubi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Z0ZBYWdGO0FBQ2hGLE9BQU8sS0FBSyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFakQsT0FBTyxFQUFDLElBQUksRUFBQyxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssTUFBTSxNQUFNLFVBQVUsQ0FBQztBQUNuQyxPQUFPLEtBQUssT0FBTyxNQUFNLFdBQVcsQ0FBQztBQUNyQyxPQUFPLEtBQUssSUFBSSxNQUFNLFFBQVEsQ0FBQztBQU0vQjs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLENBQUM7QUFDbkMsdURBQXVEO0FBQ3ZELE1BQU0sY0FBYyxHQUFHLFNBQVMsQ0FBQztBQUNqQzs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSxnQkFBZ0IsQ0FDOUIsVUFBZSxFQUNmLENBQVMsRUFDVCxRQUF3QztJQUV4QyxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO0lBQzFCLElBQUksR0FBRyxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDekMsMkVBQTJFO0lBQzNFLHdFQUF3RTtJQUN4RSw0RUFBNEU7SUFDNUUsMkVBQTJFO0lBQzNFLDZFQUE2RTtJQUM3RSxtQkFBbUI7SUFDbkIsMEVBQTBFO0lBQzFFLHdFQUF3RTtJQUN4RSxzQ0FBc0M7SUFDdEMsSUFBSSxVQUFVLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDM0QsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNsRCxJQUFJLE9BQU8s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QUFDO0FBQ25ELENBQUM7QUFDRDs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSxjQUFjLENBQzVCLFVBQWUsRUFDZixVQUFrQixFQUNsQixDQUFTLEVBQ1QsUUFBd0MsRUFDeEMsUUFBd0Q7SUFFeEQsSUFBSSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQWUsQ0FBQyxDQUFDLENBQUM7SUFDckMsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ3pDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1FBQzFDLElBQUksQ0FBQyxLQUFLLFVBQVUsRUFBRTtZQUNwQixTQUFTO1NBQ1Y7UUFDRCxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEMsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxFQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7S0FDeEM7SUFDRCxPQUFPLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUM3QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogQ29weXJpZ2h0IDIwMTYgVGhlIFRlbnNvckZsb3cgQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbnlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbllvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cblVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbmRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbldJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxubGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG49PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0qL1xuaW1wb3J0ICogYXMgdGYgZnJvbSAnLi4vd2ViYXBwL3RoaXJkX3BhcnR5L3RmanMnO1xuXG5pbXBvcnQge0tNaW59IGZyb20gJy4vaGVhcCc7XG5pbXBvcnQgKiBhcyB2ZWN0b3IgZnJvbSAnLi92ZWN0b3InO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dpbmcnO1xuaW1wb3J0ICogYXMgdXRpbCBmcm9tICcuL3V0aWwnO1xuXG5leHBvcnQgdHlwZSBOZWFyZXN0RW50cnkgPSB7XG4gIGluZGV4OiBudW1iZXI7XG4gIGRpc3Q6IG51bWJlcjtcbn07XG4vKipcbiAqIE9wdGltYWwgc2l6ZSBmb3IgdGhlIGhlaWdodCBvZiB0aGUgbWF0cml4IHdoZW4gZG9pbmcgY29tcHV0YXRpb24gb24gdGhlIEdQVVxuICogdXNpbmcgV2ViR0wuIFRoaXMgd2FzIGZvdW5kIGV4cGVyaW1lbnRhbGx5LlxuICpcbiAqIFRoaXMgYWxzbyBndWFyYW50ZWVzIHRoYXQgZm9yIGNvbXB1dGluZyBwYWlyLXdpc2UgZGlzdGFuY2UgZm9yIHVwIHRvIDEwS1xuICogdmVjdG9ycywgbm8gbW9yZSB0aGFuIDQwTUIgd2lsbCBiZSBhbGxvY2F0ZWQgaW4gdGhlIEdQVS4gV2l0aG91dCB0aGVcbiAqIGFsbG9jYXRpb24gbGltaXQsIHdlIGNhbiBmcmVlemUgdGhlIGdyYXBoaWNzIG9mIHRoZSB3aG9sZSBPUy5cbiAqL1xuY29uc3QgT1BUSU1BTF9HUFVfQkxPQ0tfU0laRSA9IDI1Njtcbi8qKiBJZCBvZiBtZXNzYWdlIGJveCB1c2VkIGZvciBrbm4gZ3B1IHByb2dyZXNzIGJhci4gKi9cbmNvbnN0IEtOTl9HUFVfTVNHX0lEID0gJ2tubi1ncHUnO1xuLyoqXG4gKiBSZXR1cm5zIHRoZSBLIG5lYXJlc3QgbmVpZ2hib3JzIGZvciBlYWNoIHZlY3RvciB3aGVyZSB0aGUgZGlzdGFuY2VcbiAqIGNvbXB1dGF0aW9uIGlzIGRvbmUgb24gdGhlIEdQVSAoV2ViR0wpIHVzaW5nIGNvc2luZSBkaXN0YW5jZS5cbiAqXG4gKiBAcGFyYW0gZGF0YVBvaW50cyBMaXN0IG9mIGRhdGEgcG9pbnRzLCB3aGVyZSBlYWNoIGRhdGEgcG9pbnQgaG9sZHMgYW5cbiAqICAgbi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gKiBAcGFyYW0gayBOdW1iZXIgb2YgbmVhcmVzdCBuZWlnaGJvcnMgdG8gZmluZC5cbiAqIEBwYXJhbSBhY2Nlc3NvciBBIG1ldGhvZCB0aGF0IHJldHVybnMgdGhlIHZlY3RvciwgZ2l2ZW4gdGhlIGRhdGEgcG9pbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kS05OR1BVQ29zaW5lPFQ+KFxuICBkYXRhUG9pbnRzOiBUW10sXG4gIGs6IG51bWJlcixcbiAgYWNjZXNzb3I6IChkYXRhUG9pbnQ6IFQpID0+IEZsb2F0MzJBcnJheVxuKTogUHJvbWlzZTxOZWFyZXN0RW50cnlbXVtdPiB7XG4gIGxldCBOID0gZGF0YVBvaW50cy5sZW5ndGg7XG4gIGxldCBkaW0gPSBhY2Nlc3NvcihkYXRhUG9pbnRzWzBdKS5sZW5ndGg7XG4gIC8vIFRoZSBnb2FsIGlzIHRvIGNvbXB1dGUgYSBsYXJnZSBtYXRyaXggbXVsdGlwbGljYXRpb24gQSpBLlQgd2hlcmUgQSBpcyBvZlxuICAvLyBzaXplIE54RCBhbmQgQS5UIGlzIGl0cyB0cmFuc3Bvc2UuIFRoaXMgcmVzdWx0cyBpbiBhIE54TiBtYXRyaXggd2hpY2hcbiAgLy8gY291bGQgYmUgdG9vIGJpZyB0byBzdG9yZSBvbiB0aGUgR1BVIG1lbW9yeS4gVG8gYXZvaWQgbWVtb3J5IG92ZXJmbG93LCB3ZVxuICAvLyBjb21wdXRlIG11bHRpcGxlIEEqcGFydGlhbF9BLlQgd2hlcmUgcGFydGlhbF9BIGlzIG9mIHNpemUgQnhEIChCIGlzIG11Y2hcbiAgLy8gc21hbGxlciB0aGFuIE4pLiBUaGlzIHJlc3VsdHMgaW4gc3RvcmluZyBvbmx5IE54QiBzaXplIG1hdHJpY2VzIG9uIHRoZSBHUFVcbiAgLy8gYXQgYSBnaXZlbiB0aW1lLlxuICAvLyBBKkEuVCB3aWxsIGdpdmUgdXMgTnhOIG1hdHJpeCBob2xkaW5nIHRoZSBjb3NpbmUgZGlzdGFuY2UgYmV0d2VlbiBldmVyeVxuICAvLyBwYWlyIG9mIHBvaW50cywgd2hpY2ggd2Ugc29ydCB1c2luZyBLTWluIGRhdGEgc3RydWN0dXJlIHRvIG9idGFpbiB0aGVcbiAgLy8gSyBuZWFyZXN0IG5laWdoYm9ycyBmb3IgZWFjaCBwb2ludC5cbiAgbGV0IHR5cGVkQXJyYXkgPSB2ZWN0b3IudG9UeXBlZEFycmF5KGRhdGFQb2ludHMsIGFjY2Vzc29yKTtcbiAgY29uc3QgYmlnTWF0cml4ID0gdGYudGVuc29yKHR5cGVkQXJyYXksIFtOLCBkaW1dKTtcbiAgbGV0IG5lYXJlc3Q6IE5lYXJlc3RFbnRyeVtdW10gPSBuZXcgQXJyYXkoTik7XG4gIGxldCBudW1QaWVjZXMgPSBNYXRoLmNlaWwoTiAvIE9QVElNQUxfR1BVX0JMT0NLX1NJWkUpO1xuICBsZXQgTSA9IE1hdGguZmxvb3IoTiAvIG51bVBpZWNlcyk7XG4gIGxldCBtb2R1bG8gPSBOICUgbnVtUGllY2VzO1xuICBsZXQgb2Zmc2V0ID0gMDtcbiAgbGV0IHByb2dyZXNzID0gMDtcbiAgbGV0IHByb2dyZXNzRGlmZiA9IDEgLyAoMiAqIG51bVBpZWNlcyk7XG4gIGxldCBwaWVjZSA9IDA7XG4gIGZ1bmN0aW9uIHN0ZXAocmVzb2x2ZTogKHJlc3VsdDogTmVhcmVzdEVudHJ5W11bXSkgPT4gdm9pZCkge1xuICAgIGxldCBwcm9ncmVzc01zZyA9XG4gICAgICAnRmluZGluZyBuZWFyZXN0IG5laWdoYm9yczogJyArIChwcm9ncmVzcyAqIDEwMCkudG9GaXhlZCgpICsgJyUnO1xuICAgIHV0aWxcbiAgICAgIC5ydW5Bc3luY1Rhc2soXG4gICAgICAgIHByb2dyZXNzTXNnLFxuICAgICAgICBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgbGV0IEIgPSBwaWVjZSA8IG1vZHVsbyA/IE0gKyAxIDogTTtcbiAgICAgICAgICBsZXQgdHlwZWRCID0gbmV3IEZsb2F0MzJBcnJheShCICogZGltKTtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IEI7ICsraSkge1xuICAgICAgICAgICAgbGV0IHZlY3RvciA9IGFjY2Vzc29yKGRhdGFQb2ludHNbb2Zmc2V0ICsgaV0pO1xuICAgICAgICAgICAgZm9yIChsZXQgZCA9IDA7IGQgPCBkaW07ICsrZCkge1xuICAgICAgICAgICAgICB0eXBlZEJbaSAqIGRpbSArIGRdID0gdmVjdG9yW2RdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBwYXJ0aWFsTWF0cml4ID0gdGYudGVuc29yKHR5cGVkQiwgW2RpbSwgQl0pO1xuXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gdGYubWF0TXVsKGJpZ01hdHJpeCwgcGFydGlhbE1hdHJpeCk7XG4gICAgICAgICAgY29uc3QgcGFydGlhbCA9IGF3YWl0IHJlc3VsdC5hcnJheSgpO1xuICAgICAgICAgIHBhcnRpYWxNYXRyaXguZGlzcG9zZSgpO1xuICAgICAgICAgIHJlc3VsdC5kaXNwb3NlKCk7XG5cbiAgICAgICAgICBwcm9ncmVzcyArPSBwcm9ncmVzc0RpZmY7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBCOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBrTWluID0gbmV3IEtNaW48TmVhcmVzdEVudHJ5PihrKTtcbiAgICAgICAgICAgIGxldCBpUmVhbCA9IG9mZnNldCArIGk7XG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgICAgICAgICAgICBpZiAoaiA9PT0gaVJlYWwpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBsZXQgY29zRGlzdCA9IDEgLSBwYXJ0aWFsW2pdW2ldO1xuICAgICAgICAgICAgICBrTWluLmFkZChjb3NEaXN0LCB7aW5kZXg6IGosIGRpc3Q6IGNvc0Rpc3R9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5lYXJlc3RbaVJlYWxdID0ga01pbi5nZXRNaW5LSXRlbXMoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcHJvZ3Jlc3MgKz0gcHJvZ3Jlc3NEaWZmO1xuICAgICAgICAgIG9mZnNldCArPSBCO1xuICAgICAgICAgIHBpZWNlKys7XG4gICAgICAgIH0sXG4gICAgICAgIEtOTl9HUFVfTVNHX0lEXG4gICAgICApXG4gICAgICAudGhlbihcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIGlmIChwaWVjZSA8IG51bVBpZWNlcykge1xuICAgICAgICAgICAgc3RlcChyZXNvbHZlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9nZ2luZy5zZXRNb2RhbE1lc3NhZ2UobnVsbCwgS05OX0dQVV9NU0dfSUQpO1xuICAgICAgICAgICAgYmlnTWF0cml4LmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIHJlc29sdmUobmVhcmVzdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICAoZXJyb3IpID0+IHtcbiAgICAgICAgICAvLyBHUFUgZmFpbGVkLiBSZXZlcnRpbmcgYmFjayB0byBDUFUuXG4gICAgICAgICAgbG9nZ2luZy5zZXRNb2RhbE1lc3NhZ2UobnVsbCwgS05OX0dQVV9NU0dfSUQpO1xuICAgICAgICAgIGxldCBkaXN0RnVuYyA9IChhLCBiLCBsaW1pdCkgPT4gdmVjdG9yLmNvc0Rpc3ROb3JtKGEsIGIpO1xuICAgICAgICAgIGZpbmRLTk4oZGF0YVBvaW50cywgaywgYWNjZXNzb3IsIGRpc3RGdW5jKS50aGVuKChuZWFyZXN0KSA9PiB7XG4gICAgICAgICAgICByZXNvbHZlKG5lYXJlc3QpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICApO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZTxOZWFyZXN0RW50cnlbXVtdPigocmVzb2x2ZSkgPT4gc3RlcChyZXNvbHZlKSk7XG59XG4vKipcbiAqIFJldHVybnMgdGhlIEsgbmVhcmVzdCBuZWlnaGJvcnMgZm9yIGVhY2ggdmVjdG9yIHdoZXJlIHRoZSBkaXN0YW5jZVxuICogY29tcHV0YXRpb24gaXMgZG9uZSBvbiB0aGUgQ1BVIHVzaW5nIGEgdXNlci1zcGVjaWZpZWQgZGlzdGFuY2UgbWV0aG9kLlxuICpcbiAqIEBwYXJhbSBkYXRhUG9pbnRzIExpc3Qgb2YgZGF0YSBwb2ludHMsIHdoZXJlIGVhY2ggZGF0YSBwb2ludCBob2xkcyBhblxuICogICBuLWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAqIEBwYXJhbSBrIE51bWJlciBvZiBuZWFyZXN0IG5laWdoYm9ycyB0byBmaW5kLlxuICogQHBhcmFtIGFjY2Vzc29yIEEgbWV0aG9kIHRoYXQgcmV0dXJucyB0aGUgdmVjdG9yLCBnaXZlbiB0aGUgZGF0YSBwb2ludC5cbiAqIEBwYXJhbSBkaXN0IE1ldGhvZCB0aGF0IHRha2VzIHR3byB2ZWN0b3JzIGFuZCBhIGxpbWl0LCBhbmQgY29tcHV0ZXMgdGhlXG4gKiAgIGRpc3RhbmNlIGJldHdlZW4gdHdvIHZlY3RvcnMsIHdpdGggdGhlIGFiaWxpdHkgdG8gc3RvcCBlYXJseSBpZiB0aGVcbiAqICAgZGlzdGFuY2UgaXMgYWJvdmUgdGhlIGxpbWl0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZEtOTjxUPihcbiAgZGF0YVBvaW50czogVFtdLFxuICBrOiBudW1iZXIsXG4gIGFjY2Vzc29yOiAoZGF0YVBvaW50OiBUKSA9PiBGbG9hdDMyQXJyYXksXG4gIGRpc3Q6IChhOiB2ZWN0b3IuVmVjdG9yLCBiOiB2ZWN0b3IuVmVjdG9yLCBsaW1pdDogbnVtYmVyKSA9PiBudW1iZXJcbik6IFByb21pc2U8TmVhcmVzdEVudHJ5W11bXT4ge1xuICByZXR1cm4gdXRpbC5ydW5Bc3luY1Rhc2s8TmVhcmVzdEVudHJ5W11bXT4oXG4gICAgJ0ZpbmRpbmcgbmVhcmVzdCBuZWlnaGJvcnMuLi4nLFxuICAgICgpID0+IHtcbiAgICAgIGxldCBOID0gZGF0YVBvaW50cy5sZW5ndGg7XG4gICAgICBsZXQgbmVhcmVzdDogTmVhcmVzdEVudHJ5W11bXSA9IG5ldyBBcnJheShOKTtcbiAgICAgIC8vIEZpbmQgdGhlIGRpc3RhbmNlcyBmcm9tIG5vZGUgaS5cbiAgICAgIGxldCBrTWluOiBLTWluPE5lYXJlc3RFbnRyeT5bXSA9IG5ldyBBcnJheShOKTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICAgIGtNaW5baV0gPSBuZXcgS01pbjxOZWFyZXN0RW50cnk+KGspO1xuICAgICAgfVxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgICAgbGV0IGEgPSBhY2Nlc3NvcihkYXRhUG9pbnRzW2ldKTtcbiAgICAgICAgbGV0IGtNaW5BID0ga01pbltpXTtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgTjsgaisrKSB7XG4gICAgICAgICAgbGV0IGtNaW5CID0ga01pbltqXTtcbiAgICAgICAgICBsZXQgbGltaXRJID1cbiAgICAgICAgICAgIGtNaW5BLmdldFNpemUoKSA9PT0ga1xuICAgICAgICAgICAgICA/IGtNaW5BLmdldExhcmdlc3RLZXkoKSB8fCBOdW1iZXIuTUFYX1ZBTFVFXG4gICAgICAgICAgICAgIDogTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgICBsZXQgbGltaXRKID1cbiAgICAgICAgICAgIGtNaW5CLmdldFNpemUoKSA9PT0ga1xuICAgICAgICAgICAgICA/IGtNaW5CLmdldExhcmdlc3RLZXkoKSB8fCBOdW1iZXIuTUFYX1ZBTFVFXG4gICAgICAgICAgICAgIDogTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgICBsZXQgbGltaXQgPSBNYXRoLm1heChsaW1pdEksIGxpbWl0Sik7XG4gICAgICAgICAgbGV0IGRpc3QySXRvSiA9IGRpc3QoYSwgYWNjZXNzb3IoZGF0YVBvaW50c1tqXSksIGxpbWl0KTtcbiAgICAgICAgICBpZiAoZGlzdDJJdG9KID49IDApIHtcbiAgICAgICAgICAgIGtNaW5BLmFkZChkaXN0Mkl0b0osIHtpbmRleDogaiwgZGlzdDogZGlzdDJJdG9KfSk7XG4gICAgICAgICAgICBrTWluQi5hZGQoZGlzdDJJdG9KLCB7aW5kZXg6IGksIGRpc3Q6IGRpc3QySXRvSn0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgICAgbmVhcmVzdFtpXSA9IGtNaW5baV0uZ2V0TWluS0l0ZW1zKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmVhcmVzdDtcbiAgICB9XG4gICk7XG59XG4vKiogQ2FsY3VsYXRlcyB0aGUgbWluaW11bSBkaXN0YW5jZSBiZXR3ZWVuIGEgc2VhcmNoIHBvaW50IGFuZCBhIHJlY3RhbmdsZS4gKi9cbmZ1bmN0aW9uIG1pbkRpc3QoXG4gIHBvaW50OiBbbnVtYmVyLCBudW1iZXJdLFxuICB4MTogbnVtYmVyLFxuICB5MTogbnVtYmVyLFxuICB4MjogbnVtYmVyLFxuICB5MjogbnVtYmVyXG4pIHtcbiAgbGV0IHggPSBwb2ludFswXTtcbiAgbGV0IHkgPSBwb2ludFsxXTtcbiAgbGV0IGR4MSA9IHggLSB4MTtcbiAgbGV0IGR4MiA9IHggLSB4MjtcbiAgbGV0IGR5MSA9IHkgLSB5MTtcbiAgbGV0IGR5MiA9IHkgLSB5MjtcbiAgaWYgKGR4MSAqIGR4MiA8PSAwKSB7XG4gICAgLy8geCBpcyBiZXR3ZWVuIHgxIGFuZCB4MlxuICAgIGlmIChkeTEgKiBkeTIgPD0gMCkge1xuICAgICAgLy8gKHgseSkgaXMgaW5zaWRlIHRoZSByZWN0YW5nbGVcbiAgICAgIHJldHVybiAwOyAvLyByZXR1cm4gMCBhcyBwb2ludCBpcyBpbiByZWN0XG4gICAgfVxuICAgIHJldHVybiBNYXRoLm1pbihNYXRoLmFicyhkeTEpLCBNYXRoLmFicyhkeTIpKTtcbiAgfVxuICBpZiAoZHkxICogZHkyIDw9IDApIHtcbiAgICAvLyB5IGlzIGJldHdlZW4geTEgYW5kIHkyXG4gICAgLy8gV2Uga25vdyBpdCBpcyBhbHJlYWR5IGluc2lkZSB0aGUgcmVjdGFuZ2xlXG4gICAgcmV0dXJuIE1hdGgubWluKE1hdGguYWJzKGR4MSksIE1hdGguYWJzKGR4MikpO1xuICB9XG4gIGxldCBjb3JuZXI6IFtudW1iZXIsIG51bWJlcl07XG4gIGlmICh4ID4geDIpIHtcbiAgICAvLyBVcHBlci1yaWdodCB2cyBsb3dlci1yaWdodC5cbiAgICBjb3JuZXIgPSB5ID4geTIgPyBbeDIsIHkyXSA6IFt4MiwgeTFdO1xuICB9IGVsc2Uge1xuICAgIC8vIFVwcGVyLWxlZnQgdnMgbG93ZXItbGVmdC5cbiAgICBjb3JuZXIgPSB5ID4geTIgPyBbeDEsIHkyXSA6IFt4MSwgeTFdO1xuICB9XG4gIHJldHVybiBNYXRoLnNxcnQodmVjdG9yLmRpc3QyMkQoW3gsIHldLCBjb3JuZXIpKTtcbn1cbi8qKlxuICogUmV0dXJucyB0aGUgbmVhcmVzdCBuZWlnaGJvcnMgb2YgYSBwYXJ0aWN1bGFyIHBvaW50LlxuICpcbiAqIEBwYXJhbSBkYXRhUG9pbnRzIExpc3Qgb2YgZGF0YSBwb2ludHMuXG4gKiBAcGFyYW0gcG9pbnRJbmRleCBUaGUgaW5kZXggb2YgdGhlIHBvaW50IHdlIG5lZWQgdGhlIG5lYXJlc3QgbmVpZ2hib3JzIG9mLlxuICogQHBhcmFtIGsgTnVtYmVyIG9mIG5lYXJlc3QgbmVpZ2hib3JzIHRvIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0gYWNjZXNzb3IgTWV0aG9kIHRoYXQgbWFwcyBhIGRhdGEgcG9pbnQgPT4gdmVjdG9yIChhcnJheSBvZiBudW1iZXJzKS5cbiAqIEBwYXJhbSBkaXN0YW5jZSBNZXRob2QgdGhhdCB0YWtlcyB0d28gdmVjdG9ycyBhbmQgcmV0dXJucyB0aGVpciBkaXN0YW5jZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRLTk5vZlBvaW50PFQ+KFxuICBkYXRhUG9pbnRzOiBUW10sXG4gIHBvaW50SW5kZXg6IG51bWJlcixcbiAgazogbnVtYmVyLFxuICBhY2Nlc3NvcjogKGRhdGFQb2ludDogVCkgPT4gRmxvYXQzMkFycmF5LFxuICBkaXN0YW5jZTogKGE6IHZlY3Rvci5WZWN0b3IsIGI6IHZlY3Rvci5WZWN0b3IpID0+IG51bWJlclxuKSB7XG4gIGxldCBrTWluID0gbmV3IEtNaW48TmVhcmVzdEVudHJ5PihrKTtcbiAgbGV0IGEgPSBhY2Nlc3NvcihkYXRhUG9pbnRzW3BvaW50SW5kZXhdKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhUG9pbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGkgPT09IHBvaW50SW5kZXgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBsZXQgYiA9IGFjY2Vzc29yKGRhdGFQb2ludHNbaV0pO1xuICAgIGxldCBkaXN0ID0gZGlzdGFuY2UoYSwgYik7XG4gICAga01pbi5hZGQoZGlzdCwge2luZGV4OiBpLCBkaXN0OiBkaXN0fSk7XG4gIH1cbiAgcmV0dXJuIGtNaW4uZ2V0TWluS0l0ZW1zKCk7XG59XG4iXX0=