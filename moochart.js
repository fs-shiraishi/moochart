
/*
 * moochart
 *
 * @version     0.3
 * @license     MIT-style license
 * @author      Johan Nordberg <norddan@gmail.com>
 * @infos       http://moochart.coneri.se
 * @copyright   Author
 *
*/

var Chart = new Class({
  
  Implements: Options,
  
  options: {
    width: 600,
    height: 400,
    padding: { /* where labels live */
      top: 20,
      left: 40,
      bottom: 30,
      right: 20
    },
    id: null,
    xlabel: {
      steps: 10,
      size: 10
    },
    ylabel: {
      steps: 10,
      size: 10
    },
    className: 'moochart',
    labelColor: '#00000',
    labelTextColor: '#000000',
  },
  
  setDefaults: {},
  
  xmax: null,
  ymax: null,
  xmin: Infinity,
  ymin: Infinity,
  cache: null,
  sets: [],
  innerPadding: {x: 10, y: 10},
  
  initialize: function(options) {    
    this.setOptions(options);
    this.id = this.options.id || 'MooChart_' + $time();
    this._pos = null;
    this._active = {set: null, point: null};
  },
  
  buildElement: function(){
    var canvas = document.createElement('canvas');
    canvas.id = this.id;
    canvas.className = this.options.className;
    canvas.width = this.options.width;
    canvas.height = this.options.height;
    canvas.style.display = 'block';
    
    // jumpstart excanvas if present
    if (typeof G_vmlCanvasManager != 'undefined') {
      G_vmlCanvasManager.initElement(canvas);
    }
    
    canvas.addEvents({
      mouseenter: this.mouseEnter.bindWithEvent(this),
      mouseleave: this.mouseLeave.bindWithEvent(this)
    });
    
    var mouseListener = (Browser.Engine.trident) ? document : canvas;
    mouseListener.addEvent('mousemove', this.mouseMove.bindWithEvent(this));
    
    window.addEvent('resize', this.resetPosition.bindWithEvent(this));
    
    this.element = canvas;
    this.redraw();
  },
  
  toElement: function(){
    if (!this.element)
      this.buildElement();
    return this.element;
  },
  
  resetPosition: function(){
    this._pos = null;
  },
  
  getPosition: function(){
    if (!this._pos && this.element)
      this._pos = this.element.getPosition();
    return this._pos;
  },
  
  /* returns drawing context */
  getCtx: function(){
    return this.toElement().getContext('2d');
  },
  
  /* takes absolute page coords and translates it relative to canvas */
  translateCoords: function(coords){
    var pos = this.getPosition();
    return {
      x: coords.x - pos.x,
      y: coords.y - pos.y
    };
  },
  
  /* checks if point is inside rect */
  rectContainsPoint: function(rect, point){
    return (
      point.x >= rect.x &&
      point.x < rect.x + rect.width
    );
  },
  
  /* store current drawn graphics to a restorable state */
  cacheCurrentState: function(){
    var cache = new Image();
    cache.addEvent('load', (function(){
      this.cache = cache;
    }).bind(this));
  },
  
  clearCache: function(){
    this.cache = null;
  },
  
  /* add dataset to chart
     dataset (standard) format: [[x, y], [x, y], ..] */
  add: function(data, options){
    this.dataSetsWillChange();
    if (!options) var options = {};
    var defaults = {};
    for (var k in this.setDefaults) {
      defaults[k] = this.setDefaults[k];
    }
    this.sets.unshift({
      options: $extend(defaults, options),
      data: data
    });
    this.dataSetsDidChange();
  },
  
  /* calculate drawable area (aka. dont' draw on labels) */
  getDrawRect: function(){
    var w = this.options.width, h = this.options.height;
    var p = this.options.padding;
    return {
      x: p.left,
      y: p.top,
      width: w - (p.left + p.right),
      height: h - (p.top + p.bottom)
    };
  },
  
  /* get min and max values for all sets */
  getSetsRange: function(){
    var xmax = this.xmax, ymax = this.ymax
    var xmin = this.xmin, ymin = this.ymin;
    this.sets.each(function(set){
      for (var i=0; i < set.data.length; i++) {
        var x = set.data[i][0], y = set.data[i][1];
        if (x > xmax) xmax = x;
        if (y > ymax) ymax = y;
        if (x < xmin) xmin = x;
        if (y < ymin) ymin = y;
      }
    });
    return {
      x: {max: xmax, min: xmin},
      y: {max: ymax, min: ymin}
    };
  },
  
  /* map sets data xy values to pixel coordinates */
  updatePoints: function(){
    var rect = this.getDrawRect();
    var range = this.getSetsRange();
    var pointRect = {
      x: rect.x + this.innerPadding.x,
      y: rect.y + this.innerPadding.y,
      width: rect.width - this.innerPadding.x * 2,
      height: rect.height - this.innerPadding.y * 2
    };
    
    var xunit = pointRect.width / (range.x.max - range.x.min);
    var yunit = pointRect.height / (range.y.max - range.y.min);
    
    var points = [];
    
    for (var set_idx=0; set_idx < this.sets.length; set_idx++) {
      var set = this.sets[set_idx];
      points[set_idx] = [];
      for (var data_idx=0; data_idx < set.data.length; data_idx++) {
        var xval = set.data[data_idx][0], yval = set.data[data_idx][1]; 
        var x = pointRect.x + ((xval - range.x.min) * xunit);
        var y = pointRect.y + (pointRect.height - (yval - range.y.min) * yunit);
        points[set_idx][data_idx] = [x, y];
      }
    }
    
    this.points = {
      pointSets: points,
      xunit: xunit,
      yunit: yunit,
      xsteps: range.x.max - range.x.min,
      ysteps: range.y.max - range.y.min,
      rect: pointRect,
      range: range
    };
  },
  
  drawLabels: function(ctx, rect){
    var range = this.getSetsRange();
    
    var w = this.options.width;
    var h = this.options.height;
    var p = this.options.padding;
    var lw = 1;
    
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(p.left-lw, p.top-lw);
    ctx.lineTo(p.left-lw, h - p.bottom + lw);
    ctx.lineTo(w - p.right, h - p.bottom + lw);
    ctx.stroke();
    
    ctx.font = '8pt Helvetica';
    
    this.drawXLabels(ctx, rect);
    this.drawYLabels(ctx, rect);
  },
  
  drawXLabels: function(ctx, rect){
    var rx = this.points.rect.x;
    var xu = this.points.xunit * this.points.xsteps / (this.options.xlabel.steps - 1);
    
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    
    for (var i=1; i < this.options.xlabel.steps+1; i++) {
      var x = rx+xu*(i-1), y = rect.height+rect.y;
      var val = (xu*(i-1)) / this.points.xunit + this.points.range.x.min;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      
      var text = this.formatXValue(val);
      ctx.fillText(text, x, y + 14);
    }
  },
  
  drawYLabels: function(ctx, rect){  
    var yb = this.options.padding.bottom + this.innerPadding.y;
    var yu = this.points.yunit * this.points.ysteps / (this.options.ylabel.steps - 1);
    
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    
    for (var i=1; i < this.options.ylabel.steps+1; i++) {
      var x = rect.x, y = this.options.height-(yb+yu*(i-1));
      var val = (yu*(i-1)) / this.points.yunit + this.points.range.y.min;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10, y);
      ctx.stroke();
      
      var text = this.formatYValue(val);
      ctx.fillText(text, x - 14, y);
    }
  },
  
  redraw: function(){
    var ctx = this.getCtx();
    ctx.clearRect(0, 0, this.options.width, this.options.height);
    if (this.cache) {
      ctx.drawImage(this.cache, 0, 0);
    } else {
      if (this.sets.length > 0) {
        var rect = this.getDrawRect();
        this.drawLabels(ctx, rect);
        this.drawGraph(ctx, rect);
      } else {
        this.drawNoData(ctx);
      }
      this.cacheCurrentState();
    }
  },
  
  drawNoData: function(ctx){
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = '18pt Helvetica';
    ctx.fillText('No data', this.options.width/2, this.options.height/2);
  },
  
  mouseMove: function(event){
    if (this.sets.length == 0) return;
    var coords = this.translateCoords(event.page);
    var active = this.hitTest(coords);
    if (active) {
      if (active.set != this._active.set || active.point != this._active.point) {
        this.redraw();
        this.drawActive(this.getCtx(), active);
        this._active = active;
      }
    } else if (this._active.set != null || this._active.point != null) {
      this._active = {set: null, point: null};
      this.redraw();
    }
  },
  mouseEnter: function(event){},
  mouseLeave: function(event){
    this._active = {set: null, point: null};
    this.redraw();
  },
  
  hitTest: function(){ return false; },
  drawGraph: function(ctx, rect){},
  drawActive: function(ctx, point){},
  
  dataSetsWillChange: function(){},
  dataSetsDidChange: function(){
    this.updatePoints();
    this.redraw();
  },
  formatXValue: function(value){ return Math.round(value); },
  formatYValue: function(value){ return Math.round(value); },
  
});


Chart.Bar = new Class({
  
  Extends: Chart,
  
  options: {
    barWidth: 50,
    extraPadding: 10
  },
  
  setDefaults: {
    color: '#ffff00',
    hoverColor: '#000000'
  },
  
  ymin: 0,
  ymax: 100,
  
  initialize: function(options) {
    this.parent(options);
    this.innerPadding.x = (this.options.barWidth / 2) + this.options.extraPadding;
    this.innerPadding.y = 0;
  },
  
  hitTest: function(c){
    for (var set_idx=0; set_idx < this.points.pointSets.length; set_idx++) {
      var set = this.points.pointSets[set_idx];
      for (var point_idx=0; point_idx < set.length; point_idx++) {
        var x = set[point_idx][0], y = set[point_idx][1];
        var rect = {
          width: this.options.barWidth,
          height: 100,
          x: x - this.options.barWidth/2,
          y: y
        };
        if (this.rectContainsPoint(rect, c))
          return {set: set_idx, point: point_idx};
      };
    }
    return null;
  },
  
  drawActive: function(ctx, active){
    var bw2 = this.options.barWidth / 2;
    var point = this.points.pointSets[active.set][active.point];
    var options = this.sets[active.set].options;
    var rect = this.getDrawRect();
    
    ctx.fillStyle = options.hoverColor;
    this.drawBar(ctx, rect, point);
    ctx.fill();
  },
  
  drawGraph: function(ctx, rect){
    for (var set_idx=0; set_idx < this.points.pointSets.length; set_idx++) {
      var set = this.points.pointSets[set_idx];
      ctx.fillStyle = this.sets[set_idx].options.color;
      for (var i=0; i < set.length; i++) {
        this.drawBar(ctx, rect, set[i]);
        ctx.fill();
      }
    }
  },
  
  drawBar: function(ctx, rect, point){
    var bw = this.options.barWidth / 2;
    ctx.beginPath();
    ctx.moveTo(point[0] - bw, rect.y + rect.height);
    ctx.lineTo(point[0] - bw, point[1]);
    ctx.lineTo(point[0] + bw, point[1]);
    ctx.lineTo(point[0] + bw, rect.y + rect.height);
    ctx.closePath();
  },
  
  dataSetsDidChange: function(){
    this.updatePoints();
    this.options.xlabel.steps = this.points.xsteps + 1;
    this.redraw();
  },
  
});

Chart.Line = new Class({
  
  Extends: Chart,
  
  setDefaults: {
    color: '#000000',
    lineWidth: 4,
    pointSize: 5,
    pointZoom: 1.5,
    smooth: true
  },
  
  hitTest: function(c){
    for (var i=0; i < this.points.pointSets.length; i++) {
      var p = this.points.pointSets[i];
      var cz = this.sets[i].options.pointSize * this.sets[i].options.pointZoom;
      for (var j = p.length - 1; j >= 0; j--){
        var cx = c.x - p[j][0], cy = c.y - p[j][1];
        if ((cx * cx) + (cy * cy) <= (cz * cz))
          return {set: i, point: j};
      }
    }
    return null;
  },
  
  drawGraph: function(ctx, rect){
    ctx.lineJoin = 'bevel';
    
    for (var idx = this.points.pointSets.length - 1; idx >= 0; idx--){
      var set = this.sets[idx];
      var points = this.points.pointSets[idx];
      
      ctx.strokeStyle = set.options.color;
      ctx.fillStyle = set.options.color;
      ctx.lineWidth = set.options.lineWidth;
      
      if (set.options.lineWidth > 0) {
        // draw lines
        ctx.beginPath();
        if (set.options.smooth) {
          var cp = this.getCurveControlPoints(points);
          for (var i = 0; i < points.length; i++) {
            if (i == 0) ctx.moveTo(points[0][0], points[0][1]);
            else ctx.bezierCurveTo(cp[0][i-1][0], cp[0][i-1][1], // control point 1
                                   cp[1][i-1][0], cp[1][i-1][1], // control point 2
                                   points[i][0], points[i][1]);
          }
        } else {
          for (var i=0; i < points.length; i++) {
            var x = points[i][0], y = points[i][1];
            if (i == 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      
      if (set.options.pointSize > 0) {
        // draw dots
        for (var i=0; i < points.length; i++) {
          ctx.beginPath();
          ctx.arc(points[i][0], points[i][1], set.options.pointSize, 0, Math.PI * 2, true);
          ctx.fill();
        };
      }
    };
  },
  
  getCurveControlPoints: function(points){
    var l = points.length - 1, rhs = [];
    
    for (var i = 1; i < l; i++)
      rhs[i] = 4 * points[i][0] + 2 * points[i+1][0];
    rhs[0] = points[0][0] + 2 * points[1][0];
    rhs[l - 1] = (8 * points[l - 1][0] + points[l][0]) / 2;
    var x = this.getFirstControlPoints(rhs);
    
    for (var i = 1; i < l - 1; i++)
      rhs[i] = 4 * points[i][1] + 2 * points[i+1][1];
    rhs[0] = points[0][1] + 2 * points[1][1];
    rhs[l - 1] = (8 * points[l - 1][1] + points[l][1]) / 2;
    var y = this.getFirstControlPoints(rhs);
    
    var cp1 = [], cp2 = [];
    for (var i = 0; i < l; i++) {
      cp1[i] = [x[i], y[i]];
      if (i < l - 1)
        cp2[i] = [2 * points[i + 1][0] - x[i + 1], 2 * points[i + 1][1] - y[i + 1]];
      else
        cp2[i] = [(points[l][0] + x[l-1]) / 2, (points[l][1] + y[l-1]) / 2];
    }
    
    return [cp1, cp2];
  },

  getFirstControlPoints: function(rhs){
    var l = rhs.length, x = [], tmp = [], b = 2;  
    x[0] = rhs[0] / b;
    for (var i = 1; i < l; i++) {
      tmp[i] = 1 / b;
      b = (i < l - 1 ? 4.0 : 3.5) - tmp[i];
      x[i] = (rhs[i] - x[i - 1]) / b;
    }
    for (var i = 1; i < l; i++)
      x[l - i - 1] -= tmp[l - i] * x[l - i];
    
    return x;
  },
  
  drawActive: function(ctx, active){
    var point = this.points.pointSets[active.set][active.point];
    var options = this.sets[active.set].options;
    
    ctx.strokeStyle = options.color;
    ctx.fillStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    
    ctx.beginPath();
    ctx.arc(point[0], point[1], options.pointSize * options.pointZoom, 0, Math.PI * 2, true);
    ctx.fill();
  }
  
});

Chart.DateLine = new Class({
  
  Extends: Chart.Line,
  
  drawXLabels: function(ctx, rect){
    
  },
  
  formatXValue: function(val){
    var date = new Date(), r = [];
    var yearNow = date.getFullYear();
    date.setTime(val * 1000);
    if (yearNow != date.getFullYear()) {
      r.push(date.getFullYear());
    }
    r.push(date.getMonth()+1);
    r.push(date.getDate());
    r = r.map(function(v){
      v = String(v);
      return (v.length == 1) ? '0' + v : v;
    });
    return r.join('-');
  }
  
});
