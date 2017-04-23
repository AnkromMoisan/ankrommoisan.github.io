L.mapbox.accessToken = 'pk.eyJ1IjoicnlhbnRtIiwiYSI6ImNpaDgycjExZzB0NDR1MWtpbWdkeDhxbmIifQ.AamjhGik8yPxK5V71kzHdw';

var bbox = [ -122.8106689453125, 45.37144349133922, -122.4584197998047, 45.65724779513408 ];
var map = L.mapbox.map('map', 'mapbox.dark',
    {zoomControl: false ,attributionControl: false, infoControl: true})
    .setView([45.5231,-122.6765], 13);
map.scrollWheelZoom.disable();

var layerGroup = L.layerGroup().addTo(map);

function AJAX(method, url, callback){
  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if(xhttp.readyState == 4 && xhttp.status == 200){
      var result = JSON.parse(xhttp.responseText);
      callback(result);
    }
  };
  xhttp.open(method, url, true);
  xhttp.send();
}

AJAX('GET','  https://s3-us-west-2.amazonaws.com/s3arch-dev/developmentData.json',function(result){
  proceed(result);
});

function proceed(results){
  var months = results.dates;
  var squaregrid = results.data;

  var totals = months.map(function(m, i){
    var total = 0;
    squaregrid.features.forEach(function(cell) {
      total += parseInt(cell.properties[m] != undefined ? cell.properties[m] : 0);
    });
    return total;
  });
  console.log(totals);

  var activeGrid = squaregrid;
  // var activeGrid = squaregrid;
  var activeGridName = 'heat';
  // var activeGridName = 'square';
  var speeds = {
      'slow': 1000,
      'medium': 500,
      'fast': 100
  };
  var speed = speeds.fast;

  var start = 0;
  var stop = months.length-1;
  var month = 0;
  var i = 0;
  setInterval(function() {
      if(i % speed === 0){
          setViz(activeGrid, month.toString());
          month++;
      }
      if(month >= stop) month = start;
      i+=5;
  }, 1);

  function setViz (grid, month) {
      // update month
      drawProgress();
      document.getElementById('month').innerHTML = months[month].split('/')[0]+'/'+months[month].split('/')[1]+'/'+months[month].split('/')[2];
      // filter empty data
      var filtered = turf.featurecollection([]);
      filtered.features = grid.features.filter(function(cell){
          return cell.properties[months[month]];
      });
      // clear old data
      layerGroup.clearLayers();

      if(activeGridName === 'heat') {
          // heatmap on points
          var contour = '#000';
          var heatData = filtered.features.map(function(pt) {
              return [pt.geometry.coordinates[1], pt.geometry.coordinates[0], pt.properties[months[month]] == undefined ? 0 : pt.properties[months[month]]/20];
          });

          // deal wih z11 & 12 & 13
          var radius = 5;
          var blur = 5;
          if(map._zoom ===11) {
              radius = 15;
              blur = 20;
          }
          if(map._zoom ===12) {
              radius = 30;
              blur = 25;
          }
          if(map._zoom ===13) {
              radius = 40;
              blur = 50;
          }

          L.heatLayer(heatData, {
              maxZoom: 10,
              radius: radius,
              blur: blur,
              max:1,
              gradient: {0:contour,0.1:'#deebf7',
                  0.2:'#deebf7',0.21:contour,0.22:'#deebf7',
                  0.4:'#deebf7',0.41:contour,0.42:'#deebf7',
                  0.6:'#9ecae1',0.61:contour,0.62:'#9ecae1',
                  0.8:'#9ecae1',0.81:contour,0.82:'#9ecae1',
                  0.988:'#3182bd',0.989:contour,0.90:'#3182bd',
                  0.97:'#0167b1',0.98:contour,0.99:'#0167b1',
                  1:'#0167b1'}
              }).addTo(layerGroup);
      } else {
          // poly grid layers
          var prop = month.toString()+'_class';
          filtered.features.forEach(function(cell) {
              cell.properties.fill = '#f00';
              cell.properties['stroke-width'] = 0;
              cell.properties.stroke = '#000';
              cell.properties['stroke-opacity'] = 0;
              cell.properties['fill-opacity'] = (cell.properties[months[month]])/20;
          });

          L.geoJson(filtered, {
              style: L.mapbox.simplestyle.style,
          }).addTo(layerGroup);
      }
  }

  drawTime();
  window.onresize = drawTime;

  function drawTime (){
      var width = window.innerWidth;
      var height = 40;

      // linear scaling
      var x = d3.time.scale()
          .range([0, width]);
      var y = d3.scale.pow().exponent(1.2)
          .range([height, 0]);

      // create brush
      var brush = d3.svg.brush()
          .x(x)
          .on('brush', brushmove)
          .on('brushend', brushend);

      var area = d3.svg.area().interpolate('monotone')
          .x(function(d, i) { return x(i); })
          .y0(height)
          .y1(function(d) { return y(d); });
      console.log(area);

      document.getElementById('totals').innerHTML = '';
      var svg = d3.select('#totals').append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('id','tracker')
          .append('g');

      x.domain(d3.extent(totals, function(d, i) { return i; }));
      y.domain([0, d3.max(totals, function(d) { return d; })]);
      svg.append('path')
          .datum(totals)
          .attr('class', 'area')
          .attr('d', area);

      // brush logic
      var brushg = svg.append('g')
          .attr('class', 'brush')
          .call(brush);

      var handle = d3.svg.area()
          .x(function(d, i) { return i; })
          .y0(height)
          .y1(0);

      brushg.selectAll('.resize').append('path')
          .attr('d', handle);

      brushg.selectAll('rect')
          .attr('height', height);

      brushstart();
      brushmove();

      // x axis w/ dates
      var ticks = months.filter(function(m){
          if(m.split('/')[1] === '01' ) return m;
      });
      var xAxis = d3.svg.axis()
          .scale(x)
          .ticks(months.length)
          .tickFormat(function(d,i){
              if(months[d*1].split('/')[1] === '01') return months[d*1].split('/')[0];

          })
          .orient('top');
      svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0, 47)')
          .call(xAxis)
          .selectAll("text")
          .attr("y", 0)
          .attr("x", -20)
          .attr("dy", ".35em")
          .attr("transform", "rotate(90)")
          .style("text-anchor", "start");

      function brushstart() {
          brush.extent([0,months.length-1]);
      }

      function brushmove() {
          var s = brush.extent();
          start = s[0]*1;
          stop = s[1]*1;
          month = start;
      }

      function brushend() {
          if (!d3.event.sourceEvent) return; // only transition after input
          var extent0 = brush.extent(),
            extent1 = extent0.map(function(val) { return Math.round(val); });

          // if user clicks tracker, set to month clicked
          if (extent1[0] >= extent1[1]) {
              month=extent1[0];
              start=0;
              stop = months.length-1;
          }
          else {
              d3.select(this).transition()
                .call(brush.extent(extent1))
                .call(brush.event);
          }
      }
  }

  function drawProgress(){
      var width = window.innerWidth;
      document.getElementById('progress').style.width = (month/(months.length-1))*(width)+'px';
  }
}
