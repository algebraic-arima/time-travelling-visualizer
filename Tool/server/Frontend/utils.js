
const NUM_POINTS_FOG_THRESHOLD = 5000;
const MIN_POINT_SIZE = 5;
const IMAGE_SIZE = 30;
// Constants relating to the indices of buffer arrays.
const RGB_NUM_ELEMENTS = 3;
const INDEX_NUM_ELEMENTS = 1;
const XYZ_NUM_ELEMENTS = 3;


  function createUniforms(){
    return {
      texture: {type: 't'},
      spritesPerRow: {type: 'f'},
      spritesPerColumn: {type: 'f'},
      fogColor: {type: 'c'},
      fogNear: {type: 'f'},
      fogFar: {type: 'f'},
      isImage: {type: 'bool'},
      sizeAttenuation: {type: 'bool'},
      pointSize: {type: 'f'},
    };
}

  function createVertexShader() {
  return `
  // Index of the specific vertex (passed in as bufferAttribute), and the
  // variable that will be used to pass it to the fragment shader.
  attribute float spriteIndex;
  attribute vec3 color;
  attribute float scaleFactor;

  varying vec2 xyIndex;
  varying vec3 vColor;

  uniform bool sizeAttenuation;
  uniform float pointSize;
  uniform float spritesPerRow;
  uniform float spritesPerColumn;

  ${THREE.ShaderChunk['fog_pars_vertex']}

  void main() {
    // Pass index and color values to fragment shader.
    vColor = color;
    xyIndex = vec2(mod(spriteIndex, spritesPerRow),
              floor(spriteIndex / spritesPerColumn));

    // Transform current vertex by modelViewMatrix (model world position and
    // camera world position matrix).
    vec4 cameraSpacePos = modelViewMatrix * vec4(position, 1.0);

    // Project vertex in camera-space to screen coordinates using the camera's
    // projection matrix.
    gl_Position = projectionMatrix * cameraSpacePos;

    // Create size attenuation (if we're in 3D mode) by making the size of
    // each point inversly proportional to its distance to the camera.
    float outputPointSize = pointSize;
    if (sizeAttenuation) {
      outputPointSize = -pointSize / cameraSpacePos.z;
    } else {  // Create size attenuation (if we're in 2D mode)
      const float PI = 3.1415926535897932384626433832795;
      const float minScale = 0.1;  // minimum scaling factor
      const float outSpeed = 2.0;  // shrink speed when zooming out
      const float outNorm = (1. - minScale) / atan(outSpeed);
      const float maxScale = 15.0;  // maximum scaling factor
      const float inSpeed = 0.02;  // enlarge speed when zooming in
      const float zoomOffset = 0.3;  // offset zoom pivot
      float zoom = projectionMatrix[0][0] + zoomOffset;  // zoom pivot
      float scale = zoom < 1. ? 1. + outNorm * atan(outSpeed * (zoom - 1.)) :
                    1. + 2. / PI * (maxScale - 1.) * atan(inSpeed * (zoom - 1.));
      outputPointSize = pointSize * scale;
    }

    gl_PointSize =
      max(outputPointSize * scaleFactor, ${MIN_POINT_SIZE.toFixed(1)});
  }`;
}

  const FRAGMENT_SHADER_POINT_TEST_CHUNK = `
  bool point_in_unit_circle(vec2 spriteCoord) {
    vec2 centerToP = spriteCoord - vec2(0.5, 0.5);
    return dot(centerToP, centerToP) < (0.5 * 0.5);
  }

  bool point_in_unit_equilateral_triangle(vec2 spriteCoord) {
    vec3 v0 = vec3(0, 1, 0);
    vec3 v1 = vec3(0.5, 0, 0);
    vec3 v2 = vec3(1, 1, 0);
    vec3 p = vec3(spriteCoord, 0);
    float p_in_v0_v1 = cross(v1 - v0, p - v0).z;
    float p_in_v1_v2 = cross(v2 - v1, p - v1).z;
    return (p_in_v0_v1 > 0.0) && (p_in_v1_v2 > 0.0);
  }

  bool point_in_unit_square(vec2 spriteCoord) {
    return true;
  }
`;

  function createFragmentShader() {
  return `
  varying vec2 xyIndex;
  varying vec3 vColor;

  uniform sampler2D texture;
  uniform float spritesPerRow;
  uniform float spritesPerColumn;
  uniform bool isImage;

  ${THREE.ShaderChunk['common']}
  ${THREE.ShaderChunk['fog_pars_fragment']}
  ${FRAGMENT_SHADER_POINT_TEST_CHUNK}

  void main() {
    if (isImage) {
      // Coordinates of the vertex within the entire sprite image.
      vec2 coords =
        (gl_PointCoord + xyIndex) / vec2(spritesPerRow, spritesPerColumn);
      gl_FragColor = vec4(vColor, 1.0) * texture2D(texture, coords);
    } else {
      bool inside = point_in_unit_circle(gl_PointCoord);
      if (!inside) {
        discard;
      }
      gl_FragColor = vec4(vColor, 1);
    }
    ${THREE.ShaderChunk['fog_fragment']}
  }`;
}

  const FRAGMENT_SHADER_PICKING = `
  varying vec2 xyIndex;
  varying vec3 vColor;
  uniform bool isImage;

  ${FRAGMENT_SHADER_POINT_TEST_CHUNK}

  void main() {
    xyIndex; // Silence 'unused variable' warning.
    if (isImage) {
      gl_FragColor = vec4(vColor, 1);
    } else {
      bool inside = point_in_unit_circle(gl_PointCoord);
      if (!inside) {
        discard;
      }
      gl_FragColor = vec4(vColor, 1);
    }
  }`;

   function cleanMaterial(material) {
 
    
    // 释放纹理
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.specularMap) material.specularMap.dispose();
    if (material.envMap) material.envMap.dispose();

    material.dispose();
    // ...处理其他类型的纹理
}


// make general elements draggable, not canvas draggable
  function makeDraggable(dragHandle, draggableElement) {
  var dragOffsetX, dragOffsetY;

  dragHandle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();

    dragOffsetX = e.clientX - draggableElement.offsetLeft;
    dragOffsetY = e.clientY - draggableElement.offsetTop;
    document.onmouseup = closeDragElement;

    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    draggableElement.style.left = (e.clientX - dragOffsetX) + "px";
    draggableElement.style.top = (e.clientY - dragOffsetY) + "px";
  }

  function closeDragElement() {

    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function updateFixedHoverLabel(x, y, index, flag) {
  let specifiedFixedHoverLabel = makeSpecifiedVariableName('fixedHoverLabel', flag)
  const label = document.getElementById(specifiedFixedHoverLabel);
  label.style.left = `${x + 5}px`; // Offset the label slightly to the right
  label.style.top = `${y - 5}px`; // Offset the label slightly down
  label.textContent = `${index}`; // Set the index as the label's text
  label.style.display = 'block'; // Show the label
}

function updateLabelPosition(flag) {
  let specifiedSelectedPointPosition = makeSpecifiedVariableName('selectedPointPosition', flag)
 
  if (window.vueApp[specifiedSelectedPointPosition]) {
    let camera = window.vueApp.camera
    let canvas = window.vueApp.renderer.domElement;
    if (flag != '') {
      camera = window.vueApp.camera[flag]
      canvas = window.vueApp.renderer[flag].domElement;
    }

    const vector = window.vueApp[specifiedSelectedPointPosition].clone().project(camera);

    
    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = -(vector.y * 0.5 - 0.5) * canvas.clientHeight;

    let specifiedSelectedIndex = makeSpecifiedVariableName('selectedIndex', flag)
    updateFixedHoverLabel(x, y, window.vueApp[specifiedSelectedIndex], flag);
  }
}
function updateCurrHoverIndex(event, index, isDisplay, flag) {
  let specifiedHoverLabel = makeSpecifiedVariableName('hoverLabel', flag)
  const hoverLabel = document.getElementById(specifiedHoverLabel);
  if (isDisplay) {
    hoverLabel.style.left = (event.clientX + 5) + 'px';
    hoverLabel.style.top = (event.clientY - 5) + 'px';
    hoverLabel.style.display = 'block';
  } else {
    if (index !=null) {
      let specifiedHoverIndex = makeSpecifiedVariableName('hoverIndex', flag)
      window.vueApp[specifiedHoverIndex] = index;
      hoverLabel.textContent = `${index}`;
      hoverLabel.style.left = (event.clientX + 5) + 'px';
      hoverLabel.style.top = (event.clientY - 5) + 'px';
      hoverLabel.style.display = 'block';
    
    } else {
      if (hoverLabel) {
        hoverLabel.textContent = '';
        hoverLabel.style.display = 'none';
      }
    }
  }
 

}

function updateHoverIndexUsingPointPosition(pointPosition, index, isDisplay, flag, camera, renderer) {
  let specifiedHoverLabel = makeSpecifiedVariableName('hoverLabel', flag);
  const hoverLabel = document.getElementById(specifiedHoverLabel);

  if (isDisplay) {
      hoverLabel.style.left = `${screenPosition.x + 5}px`;
      hoverLabel.style.top = `${screenPosition.y - 5}px`;
      hoverLabel.style.display = 'block';
  } else {
      if (index != null) {
          const screenPosition = toScreenPosition(pointPosition, camera, renderer);
          let specifiedHoverIndex = makeSpecifiedVariableName('hoverIndex', flag);
          window.vueApp[specifiedHoverIndex] = index;
          hoverLabel.textContent = `${index}`;
          hoverLabel.style.left = `${screenPosition.x + 5}px`;
          hoverLabel.style.top = `${screenPosition.y - 5}px`;
          hoverLabel.style.display = 'block';
      } else {
          if (hoverLabel) {
              hoverLabel.textContent = '';
              hoverLabel.style.display = 'none';
          }
      }
  }
}

function toScreenPosition(obj, camera, renderer) {
  var vector = new THREE.Vector3();
  // obj is a point in 3D space
  vector.copy(obj);

  // map to normalized device coordinate (NDC) space
  vector.project(camera);

  // map to 2D screen space
  vector.x = Math.round((0.5 + vector.x / 2) * renderer.domElement.width);
  vector.y = Math.round((0.5 - vector.y / 2) * renderer.domElement.height);
  var rect = renderer.domElement.getBoundingClientRect();
  vector.x += rect.left;
  vector.y += rect.top;
  return {
      x: vector.x,
      y: vector.y
  };
}



function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function makeSpecifiedVariableName(string, flag) {
  if (flag != "") {
    return string + capitalizeFirstLetter(flag);
  }
  return string
}


function drawTimeline(res, flag) {
  console.log('res', res)
  // this.d3loader()

  const d3 = window.d3;
  let specifiedTimeLinesvg = makeSpecifiedVariableName('timeLinesvg', flag)
  let specifiedContentPath = makeSpecifiedVariableName('contentPath', flag)
  let specifiedCurrEpoch = makeSpecifiedVariableName('currEpoch', flag)

  let svgDom = document.getElementById(specifiedTimeLinesvg)


  while (svgDom?.firstChild) {
      svgDom.removeChild(svgDom.lastChild);
  }



  let total = res.structure.length
  window.treejson = res.structure

  let data = res.structure


  function tranListToTreeData(arr) {
      const newArr = []
      const map = {}
      // {
      //   '01': {id:"01", pid:"",   "name":"老王",children: [] },
      //   '02': {id:"02", pid:"01", "name":"小张",children: [] },
      // }
      arr.forEach(item => {
          item.children = []
          const key = item.value
          map[key] = item
      })

      // 2. 对于arr中的每一项
      arr.forEach(item => {
          const parent = map[item.pid]
          if (parent) {
              //    如果它有父级，把当前对象添加父级元素的children中
              parent.children.push(item)
          } else {
              //    如果它没有父级（pid:''）,直接添加到newArr
              newArr.push(item)
          }
      })

      return newArr
  }
  data = tranListToTreeData(data)[0]
  var margin = 20;
  var svg = d3.select(svgDom);
  var width = svg.attr("width");
  var height = svg.attr("height");

  //create group
  var g = svg.append("g")
      .attr("transform", "translate(" + margin + "," + 0 + ")");


  //create layer layout
  var hierarchyData = d3.hierarchy(data)
      .sum(function (d, i) {
          return d.value;
      });
  //    nodes attributes:
  //        node.data - data.
  //        node.depth - root is 0.
  //        node.height -  leaf node is 0.
  //        node.parent - parent id, root is null.
  //        node.children.
  //        node.value - total value current node and descendants;

  //create tree
  let len = total

  let svgWidth = len * 40
  if (window.sessionStorage.taskType === 'active learning') {
      svgWidth = 1000
  }
  // svgWidth = 1000
  console.log('svgWid', len, svgWidth)
  svgDom.style.width = svgWidth + 200
  if (window.sessionStorage.selectedSetting !== 'active learning' && window.sessionStorage.selectedSetting !== 'dense al') {
      svgDom.style.height = 60
      // svgDom.style.width = 2000
  }


  var tree = d3.tree()
      .size([100, svgWidth])
      .separation(function (a, b) {
          return (a.parent == b.parent ? 1 : 2) / a.depth;
      });

  //init
  var treeData = tree(hierarchyData)

  //line node
  var nodes = treeData.descendants();
  var links = treeData.links();

  //line
  var link = d3.linkHorizontal()
      .x(function (d) {
          return d.y;
      }) //linkHorizontal
      .y(function (d) {
          return d.x;
      });


  //path
  g.append('g')
      .selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('d', function (d, i) {
          var start = {
              x: d.source.x,
              y: d.source.y
          };
          var end = {
              x: d.target.x,
              y: d.target.y
          };
          return link({
              source: start,
              target: end
          });
      })
      .attr('stroke', '#452d8a')
      .attr('stroke-width', 1)
      .attr('fill', 'none');


  //创建节点与文字分组
  var gs = g.append('g')
      .selectAll('.g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('transform', function (d, i) {
          console.log("D", d)
          return 'translate(' + d.data.pid * 40 + ',' + d.x + ')';
      });

  //绘制文字和节点
  gs.append('circle')
      .attr('r', 8)
      .attr('fill', function (d, i) {
          // console.log("1111",d.data.value, window.iteration, d.data.value == window.iteration )
          return d.data.value == window.vueApp[specifiedCurrEpoch] ? 'orange' : '#452d8a'
      })
      .attr('stroke-width', 1)
      .attr('stroke', function (d, i) {
          return d.data.value == window.vueApp[specifiedCurrEpoch] ? 'orange' : '#452d8a'
      })

  gs.append('text')
      .attr('x', function (d, i) {
          return d.children ? 5 : 10;
      })
      .attr('y', function (d, i) {
          return d.children ? -20 : -5;
      })
      .attr('dy', 10)
      .text(function (d, i) {
          if (window.sessionStorage.taskType === 'active learning') {
              return `${d.data.value}|${d.data.name}`;
          } else {
              return `${d.data.value}`;
          }

      })
  setTimeout(() => {
      let list = svgDom.querySelectorAll("circle");
      for (let i = 0; i <= list.length; i++) {
          let c = list[i]
          if (c) {
              c.style.cursor = "pointer"
            
              c.addEventListener('click', (e) => {
                  if (e.target.nextSibling.innerHTML != window.vueApp[specifiedCurrEpoch]) {

                      let value = e.target.nextSibling.innerHTML.split("|")[0]
                      window.vueApp.isCanvasLoading = true
                      if (flag != '') {
                        updateContraProjection(window.vueApp[specifiedContentPath], value, window.vueApp.taskType, flag)

                        if (window.vueApp.concurrentMode == "yes") {
                          let anotherFlag = referToAnotherFlag(flag)
                          let specifiedContentPathMirror = makeSpecifiedVariableName('contentPath', anotherFlag)
                          let specifiedCurrEpochMirror = makeSpecifiedVariableName('currEpoch', anotherFlag)

                          if (window.vueApp[specifiedCurrEpochMirror] != value) {
                     
               
                            updateContraProjection(window.vueApp[specifiedContentPathMirror], value, window.vueApp.taskType, anotherFlag)
                            window.vueApp[specifiedCurrEpochMirror] = value
                            drawTimeline(res, anotherFlag)
                          //todo res currently only support same epoch number from different content paths
                          }
                          
                        } 
                        
                      } else {
                        updateProjection(window.vueApp[specifiedContentPath], value, window.vueApp.taskType)
                      }
                     
                      window.sessionStorage.setItem('acceptIndicates', "")
                      window.sessionStorage.setItem('rejectIndicates', "")
                      window.vueApp[specifiedCurrEpoch] = value
                      drawTimeline(res, flag)
                  }
              })

          }
      }
  }, 50)
}

function referToAnotherFlag(flag) {
  return flag=='ref'?'tar':'ref';
}

function setIntersection(sets) {
  if (sets.length === 0) {
    return new Set();
  }

  // Create a copy of the first set to modify
  const intersection = new Set(sets[0]);

  // Iterate over each set and keep only elements that exist in all sets
  for (let i = 1; i < sets.length; i++) {
    const currentSet = sets[i];
    for (const element of intersection) {
      if (!currentSet.has(element)) {
        intersection.delete(element);
      }
    }
  }

  return intersection;
}