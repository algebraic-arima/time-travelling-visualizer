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
import { DataSet, } from './data';
import { analyzeMetadata } from './data-provider';
export class ProtoDataProvider {
    constructor(dataProto) {
        this.dataProto = dataProto;
    }
    retrieveRuns(callback) {
        callback(['proto']);
    }
    retrieveProjectorConfig(run, callback) {
        callback({
            modelCheckpointPath: 'proto',
            embeddings: [
                {
                    tensorName: 'proto',
                    tensorShape: this.dataProto.shape,
                    metadataPath: 'proto',
                },
            ],
        });
    }
    retrieveTensor(run, tensorName, callback) {
        callback(this.flatArrayToDataset(this.dataProto.tensor));
    }
    retrieveSpriteAndMetadata(run, tensorName, callback) {
        let columnNames = this.dataProto.metadata.columns.map((c) => c.name);
        let n = this.dataProto.shape[0];
        let pointsMetadata = new Array(n);
        this.dataProto.metadata.columns.forEach((c) => {
            let values = c.numericValues || c.stringValues;
            for (let i = 0; i < n; i++) {
                pointsMetadata[i] = pointsMetadata[i] || {};
                pointsMetadata[i][c.name] = values[i];
            }
        });
        let spritesPromise = Promise.resolve(null);
        if (this.dataProto.metadata.sprite != null) {
            spritesPromise = new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject('Failed converting base64 to an image');
                image.src = this.dataProto.metadata.sprite.imageBase64;
            });
        }
        spritesPromise.then((image) => {
            const result = {
                stats: analyzeMetadata(columnNames, pointsMetadata),
                pointsInfo: pointsMetadata,
            };
            if (image != null) {
                result.spriteImage = image;
                result.spriteMetadata = {
                    singleImageDim: this.dataProto.metadata.sprite.singleImageDim,
                    imagePath: 'proto',
                };
            }
            callback(result);
        });
    }
    getBookmarks(run, tensorName, callback) {
        return callback([]);
    }
    flatArrayToDataset(tensor) {
        let points = [];
        let n = this.dataProto.shape[0];
        let d = this.dataProto.shape[1];
        if (n * d !== tensor.length) {
            throw "The shape doesn't match the length of the flattened array";
        }
        for (let i = 0; i < n; i++) {
            let offset = i * d;
            points.push({
                vector: new Float32Array(tensor.slice(offset, offset + d)),
                metadata: {},
                projections: null,
                index: i,
            });
        }
        return new DataSet(points);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YS1wcm92aWRlci1wcm90by5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3RlbnNvcmJvYXJkL3Byb2plY3Rvci9kYXRhLXByb3ZpZGVyLXByb3RvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7O2dGQWFnRjtBQUNoRixPQUFPLEVBQ0wsT0FBTyxHQU1SLE1BQU0sUUFBUSxDQUFDO0FBQ2hCLE9BQU8sRUFBQyxlQUFlLEVBQWdDLE1BQU0saUJBQWlCLENBQUM7QUFFL0UsTUFBTSxPQUFPLGlCQUFpQjtJQUU1QixZQUFZLFNBQW9CO1FBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO0lBQzdCLENBQUM7SUFDRCxZQUFZLENBQUMsUUFBa0M7UUFDN0MsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBQ0QsdUJBQXVCLENBQUMsR0FBVyxFQUFFLFFBQXNDO1FBQ3pFLFFBQVEsQ0FBQztZQUNQLG1CQUFtQixFQUFFLE9BQU87WUFDNUIsVUFBVSxFQUFFO2dCQUNWO29CQUNFLFVBQVUsRUFBRSxPQUFPO29CQUNuQixXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLO29CQUNqQyxZQUFZLEVBQUUsT0FBTztpQkFDdEI7YUFDRjtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7SUFDRCxjQUFjLENBQ1osR0FBVyxFQUNYLFVBQWtCLEVBQ2xCLFFBQStCO1FBRS9CLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFDRCx5QkFBeUIsQ0FDdkIsR0FBVyxFQUNYLFVBQWtCLEVBQ2xCLFFBQTRDO1FBRTVDLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFD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QyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUMxQixJQUFJLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ25CLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ1YsTUFBTSxFQUFFLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDMUQsUUFBUSxFQUFFLEVBQUU7Z0JBQ1osV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLEtBQUssRUFBRSxDQUFDO2FBQ1QsQ0FBQyxDQUFDO1NBQ0o7UUFDRCxPQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdCLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8qIENvcHlyaWdodCAyMDE2IFRoZSBUZW5zb3JGbG93IEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbkxpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG55b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5Zb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG5Vbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5kaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG5XSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cblNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbmxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Ki9cbmltcG9ydCB7XG4gIERhdGFTZXQsXG4gIERhdGFQcm90byxcbiAgU3RhdGUsXG4gIERhdGFQb2ludCxcbiAgU3ByaXRlQW5kTWV0YWRhdGFJbmZvLFxuICBQb2ludE1ldGFkYXRhLFxufSBmcm9tICcuL2RhdGEnO1xuaW1wb3J0IHthbmFseXplTWV0YWRhdGEsIERhdGFQcm92aWRlciwgUHJvamVjdG9yQ29uZmlnfSBmcm9tICcuL2RhdGEtcHJvdmlkZXInO1xuXG5leHBvcnQgY2xhc3MgUHJvdG9EYXRhUHJvdmlkZXIgaW1wbGVtZW50cyBEYXRhUHJvdmlkZXIge1xuICBwcml2YXRlIGRhdGFQcm90bzogRGF0YVByb3RvO1xuICBjb25zdHJ1Y3RvcihkYXRhUHJvdG86IERhdGFQcm90bykge1xuICAgIHRoaXMuZGF0YVByb3RvID0gZGF0YVByb3RvO1xuICB9XG4gIHJldHJpZXZlUnVucyhjYWxsYmFjazogKHJ1bnM6IHN0cmluZ1tdKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgY2FsbGJhY2soWydwcm90byddKTtcbiAgfVxuICByZXRyaWV2ZVByb2plY3RvckNvbmZpZyhydW46IHN0cmluZywgY2FsbGJhY2s6IChkOiBQcm9qZWN0b3JDb25maWcpID0+IHZvaWQpIHtcbiAgICBjYWxsYmFjayh7XG4gICAgICBtb2RlbENoZWNrcG9pbnRQYXRoOiAncHJvdG8nLFxuICAgICAgZW1iZWRkaW5nczogW1xuICAgICAgICB7XG4gICAgICAgICAgdGVuc29yTmFtZTogJ3Byb3RvJyxcbiAgICAgICAgICB0ZW5zb3JTaGFwZTogdGhpcy5kYXRhUHJvdG8uc2hhcGUsXG4gICAgICAgICAgbWV0YWRhdGFQYXRoOiAncHJvdG8nLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxuICByZXRyaWV2ZVRlbnNvcihcbiAgICBydW46IHN0cmluZyxcbiAgICB0ZW5zb3JOYW1lOiBzdHJpbmcsXG4gICAgY2FsbGJhY2s6IChkczogRGF0YVNldCkgPT4gdm9pZFxuICApIHtcbiAgICBjYWxsYmFjayh0aGlzLmZsYXRBcnJheVRvRGF0YXNldCh0aGlzLmRhdGFQcm90by50ZW5zb3IpKTtcbiAgfVxuICByZXRyaWV2ZVNwcml0ZUFuZE1ldGFkYXRhKFxuICAgIHJ1bjogc3RyaW5nLFxuICAgIHRlbnNvck5hbWU6IHN0cmluZyxcbiAgICBjYWxsYmFjazogKHI6IFNwcml0ZUFuZE1ldGFkYXRhSW5mbykgPT4gdm9pZFxuICApOiB2b2lkIHtcbiAgICBsZXQgY29sdW1uTmFtZXMgPSB0aGlzLmRhdGFQcm90by5tZXRhZGF0YS5jb2x1bW5zLm1hcCgoYykgPT4gYy5uYW1lKTtcbiAgICBsZXQgbiA9IHRoaXMuZGF0YVByb3RvLnNoYXBlWzBdO1xuICAgIGxldCBwb2ludHNNZXRhZGF0YTogUG9pbnRNZXRhZGF0YVtdID0gbmV3IEFycmF5KG4pO1xuICAgIHRoaXMuZGF0YVByb3RvLm1ldGFkYXRhLmNvbHVtbnMuZm9yRWFjaCgoYykgPT4ge1xuICAgICAgbGV0IHZhbHVlcyA9IGMubnVtZXJpY1ZhbHVlcyB8fCBjLnN0cmluZ1ZhbHVlcztcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHBvaW50c01ldGFkYXRhW2ldID0gcG9pbnRzTWV0YWRhdGFbaV0gfHwge307XG4gICAgICAgIHBvaW50c01ldGFkYXRhW2ldW2MubmFtZV0gPSB2YWx1ZXNbaV07XG4gICAgICB9XG4gICAgfSk7XG4gICAgbGV0IHNwcml0ZXNQcm9taXNlOiBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+ID0gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuICAgIGlmICh0aGlzLmRhdGFQcm90by5tZXRhZGF0YS5zcHJpdGUgIT0gbnVsbCkge1xuICAgICAgc3ByaXRlc1Byb21pc2UgPSBuZXcgUHJvbWlzZTxIVE1MSW1hZ2VFbGVtZW50PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XG4gICAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHJlc29sdmUoaW1hZ2UpO1xuICAgICAgICBpbWFnZS5vbmVycm9yID0gKCkgPT4gcmVqZWN0KCdGYWlsZWQgY29udmVydGluZyBiYXNlNjQgdG8gYW4gaW1hZ2UnKTtcbiAgICAgICAgaW1hZ2Uuc3JjID0gdGhpcy5kYXRhUHJvdG8ubWV0YWRhdGEuc3ByaXRlLmltYWdlQmFzZTY0O1xuICAgICAgfSk7XG4gICAgfVxuICAgIHNwcml0ZXNQcm9taXNlLnRoZW4oKGltYWdlKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQ6IFNwcml0ZUFuZE1ldGFkYXRhSW5mbyA9IHtcbiAgICAgICAgc3RhdHM6IGFuYWx5emVNZXRhZGF0YShjb2x1bW5OYW1lcywgcG9pbnRzTWV0YWRhdGEpLFxuICAgICAgICBwb2ludHNJbmZvOiBwb2ludHNNZXRhZGF0YSxcbiAgICAgIH07XG4gICAgICBpZiAoaW1hZ2UgIT0gbnVsbCkge1xuICAgICAgICByZXN1bHQuc3ByaXRlSW1hZ2UgPSBpbWFnZTtcbiAgICAgICAgcmVzdWx0LnNwcml0ZU1ldGFkYXRhID0ge1xuICAgICAgICAgIHNpbmdsZUltYWdlRGltOiB0aGlzLmRhdGFQcm90by5tZXRhZGF0YS5zcHJpdGUuc2luZ2xlSW1hZ2VEaW0sXG4gICAgICAgICAgaW1hZ2VQYXRoOiAncHJvdG8nLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgY2FsbGJhY2socmVzdWx0KTtcbiAgICB9KTtcbiAgfVxuICBnZXRCb29rbWFya3MoXG4gICAgcnVuOiBzdHJpbmcsXG4gICAgdGVuc29yTmFtZTogc3RyaW5nLFxuICAgIGNhbGxiYWNrOiAocjogU3RhdGVbXSkgPT4gdm9pZFxuICApOiB2b2lkIHtcbiAgICByZXR1cm4gY2FsbGJhY2soW10pO1xuICB9XG4gIHByaXZhdGUgZmxhdEFycmF5VG9EYXRhc2V0KHRlbnNvcjogbnVtYmVyW10pOiBEYXRhU2V0IHtcbiAgICBsZXQgcG9pbnRzOiBEYXRhUG9pbnRbXSA9IFtdO1xuICAgIGxldCBuID0gdGhpcy5kYXRhUHJvdG8uc2hhcGVbMF07XG4gICAgbGV0IGQgPSB0aGlzLmRhdGFQcm90by5zaGFwZVsxXTtcbiAgICBpZiAobiAqIGQgIT09IHRlbnNvci5sZW5ndGgpIHtcbiAgICAgIHRocm93IFwiVGhlIHNoYXBlIGRvZXNuJ3QgbWF0Y2ggdGhlIGxlbmd0aCBvZiB0aGUgZmxhdHRlbmVkIGFycmF5XCI7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICBsZXQgb2Zmc2V0ID0gaSAqIGQ7XG4gICAgICBwb2ludHMucHVzaCh7XG4gICAgICAgIHZlY3RvcjogbmV3IEZsb2F0MzJBcnJheSh0ZW5zb3Iuc2xpY2Uob2Zmc2V0LCBvZmZzZXQgKyBkKSksXG4gICAgICAgIG1ldGFkYXRhOiB7fSxcbiAgICAgICAgcHJvamVjdGlvbnM6IG51bGwsXG4gICAgICAgIGluZGV4OiBpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgRGF0YVNldChwb2ludHMpO1xuICB9XG59XG4iXX0=