// SUBTRACT MODE: same physics as pong.js. Each point removes a strip of the court.
//=============================================================================
// SETTINGS – the things you're most likely to tweak
//=============================================================================

// Look of the 3D view (all heights are fractions of the screen height)
var LOOK = {
  vanishX:    0.50,  // where the court narrows to, horizontally
  horizon:    0.40,  // ... and vertically
  ground:     0.90,  // screen position of the near edge of the court
  court:      1.00,  // court width at the near edge, as a fraction of screen width
  tableEnd:   0.78,  // where the table ends, as a fraction of the depth. The far paddle stands behind it
  depth:      3,     // perspective strength: higher = far end is smaller
  netHeight:  0.22,  // height of the net
  paddleLift: 0.06,  // paddle height above the floor

  ballLift:   0.08,  // ball height above the table when it leaves a paddle (and when it reaches the other)
  netClear:   0.30,  // ball height above the table as it crosses the net (must beat netHeight)
  bounceAt:   0.65,  // where the ball lands on the receiver's half: 0 = at the net, 1 = at the end of the table
  ballFloor:  0.03   // height of the ball's centre above the floor when it touches the table
};

var ORANGE       = '#f15a29';       // accent colour (baseline, court)
var MAX_DOTS     = 10;              // rally counter: one dot per hit
var COURT_COLUMNS = 20;             // the court is this many strips wide; every point removes one
var MIN_COLUMNS   = 6;              // narrowest playable court. One point past this, the court disappears

// Background + text for each scene (switches every point)
var SCENES = [
  { title: "start with saying this",
    img:   "",
    bg:    "",
    text:  "" },
  { title: "then say this",
    img:   "",
    bg:    "",
    text:  "" }
];

var PADDLE_IMG = new Image();
PADDLE_IMG.src = 'paddle.png';

var BALL_IMG = new Image();
BALL_IMG.src = 'ball.png';

//=============================================================================
// GAME LOGIC – from jakesgordon/javascript-pong.
// x = depth (0 = you, width = robot), y = left/right.
//=============================================================================

var Pong = {

  Defaults: { width: 640, height: 480, wallWidth: 12, paddleWidth: 12, paddleHeight: 60,
              paddleSpeed: 2, ballSpeed: 4, ballAccel: 8, ballRadius: 10 },

  // robot skill: 0 = losing by 8 ... 16 = winning by 8 (same values as the original table)
  level: function(n) { n = Math.max(0, Math.min(16, 8 + n)); return { aiReaction: 0.2 + 0.1 * n, aiError: 40 + 10 * n }; },

  initialize: function(canvas) {
    this.cfg = this.Defaults;
    this.width = this.cfg.width;  this.height = this.cfg.height;
    this.canvas = canvas;         this.ctx = canvas.getContext('2d');
    this.scores = [0, 0];  this.scene = 0;  this.speed = 1;  this.zoom = 1;
    this.rally = 0;               // paddle hits since the last point
    this.cut = [0, 0];  this.over = false;   // strips removed from the left / right; true once the court is gone
    this.keys = {};        this.trail = [];
    this.player = this.make(this.Paddle, false);
    this.robot  = this.make(this.Paddle, true);
    this.robot.auto = true;  this.robot.level = this.level(0);
    this.ball = this.make(this.Ball);
    this.ball.reset(1);
    this.showScene();
  },

  make: function(proto, arg) { var o = Object.create(proto); o.initialize(this, arg); return o; },

  // Back to a full court, 0-0, first scene
  reset: function() {
    this.scores = [0, 0];  this.cut = [0, 0];  this.rally = 0;  this.over = false;
    this.scene = 0;  this.robot.level = this.level(0);  this.robot.prediction = null;
    this.setCourt();
    [this.player, this.robot].forEach(function(p) { p.setpos(p.x, p.minY + (p.maxY - p.minY) / 2); });
    this.ball.reset(1);
    this.showScene();
  },

  // Removed strips move the side walls in. Paddles and ball keep their normal size.
  setCourt: function() {
    var strip = this.height / COURT_COLUMNS, wall = this.cfg.wallWidth;
    var lo = wall + this.cut[0] * strip, hi = this.height - wall - this.cut[1] * strip;
    [this.player, this.robot].forEach(function(p) {
      p.minY = lo;  p.maxY = hi - p.height;
      p.setpos(p.x, Math.max(p.minY, Math.min(p.maxY, p.y)));
    });
    this.ball.minY = lo + this.ball.radius;
    this.ball.maxY = hi - this.ball.radius;
  },

  goal: function(playerNo) {
    this.scores[playerNo]++;
    this.rally = 0;
    this.cut[(this.scores[0] + this.scores[1]) % 2]++;             // remove a strip, alternating sides
    if (COURT_COLUMNS - this.cut[0] - this.cut[1] < MIN_COLUMNS) {   // too narrow to play: the court is gone
      this.over = true;
      $('text').innerHTML = 'Completion through emptiness';  $('text').style.display = 'block';
      return;
    }
    this.setCourt();
    this.scene = (this.scene + 1) % SCENES.length;
    this.showScene();
    this.ball.reset(playerNo);
    this.robot.level = this.level(this.scores[1] - this.scores[0]);
  },

  update: function(dt) {
    if (this.over) return;                                          // the court no longer exists
    // you: arrow keys / A D
    var k = this.keys, p = this.player;
    p.dir = (k.ArrowLeft || k.a) ? -1 : (k.ArrowRight || k.d) ? 1 : 0;

    this.player.update(dt, this.ball);
    this.robot.update(dt, this.ball);
    this.ball.update(dt, this.player, this.robot);
    if (this.ball.left > this.width) this.goal(0);
    else if (this.ball.right < 0)    this.goal(1);
  },

  //---------------------------------------------------------------------------
  // 3D VIEW
  //---------------------------------------------------------------------------

  // world (x depth, y sideways, lift height) -> screen. k = pixels per world unit at that depth
  project: function(x, y, lift) {
    var w = this.canvas.width, h = this.canvas.height;
    var s = this.zoom / (1 + LOOK.depth * x / this.width);
    var floor = h * LOOK.horizon + h * (LOOK.ground - LOOK.horizon) * s;
    return {
      x: w * LOOK.vanishX + (y / this.height - 0.5) * w * LOOK.court * s,
      y: floor - lift * h * s,
      k: LOOK.court * w / this.height * s,
      s: s
    };
  },

  // Rally counter: orange baseline with a centre tick, one dot per hit (outer row = you, inner row = robot).
  // Drawn vertically along the right edge of the page, reading bottom to top.
  drawRally: function(ctx, w, h) {
    var k = 0.7, len = h * 0.45 / k;                              // k = scale, len = on-screen length / k
    ctx.save();
    ctx.translate(w - 40, h * 0.75);  ctx.rotate(-Math.PI / 2);  ctx.scale(k, k);      // x = distance up the line, y = distance to its left
    ctx.strokeStyle = ORANGE;  ctx.fillStyle = '#111';  ctx.lineWidth = 2;
    ctx.beginPath();  ctx.moveTo(0, 0);  ctx.lineTo(len, 0);
    ctx.moveTo(len / 2, 0);  ctx.lineTo(len / 2, -30);  ctx.stroke();
    for (var i = 0; i < Math.min(this.rally, MAX_DOTS); i++) {
      ctx.beginPath();  ctx.arc(len * (i + 0.5) / MAX_DOTS, i % 2 ? -14 : -44, 6, 0, 7);  ctx.fill();
    }
    ctx.restore();
  },

  // Subtract mode: the whole court as faint strips, the part still standing outlined and tinted
  drawCourt: function(ctx) {
    var P = this.project.bind(this), H = this.height, W = this.width * LOOK.tableEnd, strip = H / COURT_COLUMNS, i;
    ctx.lineWidth = 1;  ctx.strokeStyle = 'rgba(241,90,41,.3)';
    ctx.beginPath();
    for (i = 0; i <= COURT_COLUMNS; i++) { var a = P(0, i * strip, 0), b = P(W, i * strip, 0);  ctx.moveTo(a.x, a.y);  ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    var y0 = this.cut[0] * strip, y1 = H - this.cut[1] * strip;
    var c = [P(0, y0, 0), P(W, y0, 0), P(W, y1, 0), P(0, y1, 0)];
    ctx.beginPath();  ctx.moveTo(c[0].x, c[0].y);
    for (i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(241,90,41,.15)';  ctx.fill();
    ctx.strokeStyle = ORANGE;  ctx.lineWidth = 2;  ctx.stroke();
  },

  draw: function(ctx, w, h) {
    var self = this, ball = this.ball, netX = this.width * LOOK.tableEnd / 2, mid = this.project(netX, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (this.over) { this.drawRally(ctx, w, h);  return; }
    this.drawCourt(ctx);
    ctx.strokeStyle = 'white';

    function drawNet() {                     // straight grid across the full screen
      var top = mid.y - LOOK.netHeight * h * mid.s, step = 60 * mid.k;
      ctx.lineWidth = 1.5;  ctx.strokeStyle = 'white';  ctx.beginPath();
      for (var i = 0; i <= 3; i++) {
        var y = top + (mid.y - top) * i / 3;
        ctx.moveTo(0, y);  ctx.lineTo(w, y);
      }
      for (var x = (w * LOOK.vanishX) % step; x < w; x += step) { ctx.moveTo(x, top);  ctx.lineTo(x, mid.y); }
      ctx.stroke();
    }

    function drawBall() {
      var shadow = self.project(ball.x, ball.y, 0);          // shadow on the floor shows where it is
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.beginPath();  ctx.ellipse(shadow.x, shadow.y, ball.radius * shadow.k, ball.radius * shadow.k * .35, 0, 0, 7);  ctx.fill();

      self.trail.concat([ball]).forEach(function(b, i, all) {
        var c = self.project(b.x, b.y, b.z + LOOK.ballFloor), last = (i == all.length - 1), age = (i + 1) / all.length;
        var r = ball.radius * c.k * (last ? 1 : 0.5 + 0.4 * age);        // older copies are smaller...
        ctx.globalAlpha = last ? 1 : 0.1 * age;                          // ...and fainter
        ctx.drawImage(BALL_IMG, c.x - r, c.y - r, r * 2, r * 2);
      });
      ctx.globalAlpha = 1;
    }

    this.robot.draw(ctx);
    if (ball.x > netX) { drawBall();  drawNet(); }   // ball behind the net
    else                         { drawNet();   drawBall(); }  // ball in front of it
    this.player.draw(ctx);
    this.drawRally(ctx, w, h);
  },

  showScene: function() {
    var s = SCENES[this.scene];
    $('bg').style.background = s.img ? 'url("' + s.img + '") center / cover, ' + s.bg : s.bg;
    $('title').textContent = s.title;
    $('text').innerHTML = s.text;
    $('text').style.display = s.text ? 'block' : 'none';
  },

  //=============================================================================
  // PADDLE
  //=============================================================================

  Paddle: {

    initialize: function(pong, rhs) {
      this.pong   = pong;
      this.width  = pong.cfg.paddleWidth;
      this.height = pong.cfg.paddleHeight;
      this.minY   = pong.cfg.wallWidth;
      this.maxY   = pong.height - pong.cfg.wallWidth - this.height;
      this.speed  = (this.maxY - this.minY) / pong.cfg.paddleSpeed;
      this.dir    = 0;  // -1 left, 0 stop, 1 right
      this.setpos(rhs ? pong.width - this.width : 0, this.minY + (this.maxY - this.minY) / 2);
    },

    setpos: function(x, y) {
      this.x = x;  this.y = y;
      this.left = x;  this.right = x + this.width;  this.top = y;  this.bottom = y + this.height;
    },

    update: function(dt, ball) {
      if (this.auto) this.ai(dt, ball);
      if (this.dir) this.setpos(this.x, Math.max(this.minY, Math.min(this.maxY, this.y + this.dir * dt * this.speed)));
    },

    ai: function(dt, ball) {
      if (ball.dx < 0) { this.dir = 0;  return; }                  // ball moving away: do nothing
      this.predict(ball, dt);
      if (this.prediction) {
        var mid = this.top + this.height / 2;
        this.dir = this.prediction.y < mid - 5 ? -1 : this.prediction.y > mid + 5 ? 1 : 0;
      }
    },

    predict: function(ball, dt) {
      var p = this.prediction;                                     // only re-predict after a reaction delay
      if (p && p.dx * ball.dx > 0 && p.dy * ball.dy > 0 && p.since < this.level.aiReaction) { p.since += dt;  return; }

      var pt = Pong.Helper.ballIntercept(ball, { left: this.left, right: this.right, top: -10000, bottom: 10000 }, ball.dx * 10, ball.dy * 10);
      if (pt) {
        var t = this.minY + ball.radius, b = this.maxY + this.height - ball.radius;
        while (pt.y < t || pt.y > b) pt.y = pt.y < t ? t + (t - pt.y) : t + (b - t) - (pt.y - b);   // bounce off the walls
        var closeness = (this.left - ball.x) / this.pong.width;
        var error = this.level.aiError * closeness;                // robot is less accurate when far from the ball
        pt.since = 0;  pt.dx = ball.dx;  pt.dy = ball.dy;
        pt.y += (Math.random() * 2 - 1) * error;
      }
      this.prediction = pt;
    },

    draw: function(ctx) {
      var c = this.pong.project(this.x, this.y + this.height / 2, LOOK.paddleLift);
      var w = this.height * c.k;                         // image width on screen (shrinks with distance)
      var h = w * PADDLE_IMG.height / PADDLE_IMG.width;  // keep the image's proportions
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(this.x ? 0.35 : -0.35);                 // tilt; set to 0 for no tilt
      ctx.drawImage(PADDLE_IMG, -w / 2, -h * 0.35, w, h);
      ctx.restore();
    }
  },

  //=============================================================================
  // BALL
  //=============================================================================

  Ball: {

    initialize: function(pong) {
      this.pong   = pong;
      this.radius = pong.cfg.ballRadius;
      this.minX   = this.radius;
      this.maxX   = pong.width - this.radius;
      this.minY   = pong.cfg.wallWidth + this.radius;
      this.maxY   = pong.height - pong.cfg.wallWidth - this.radius;
      this.speed  = (this.maxX - this.minX) / pong.cfg.ballSpeed;
      this.accel  = pong.cfg.ballAccel;
      this.frame  = 0;
    },

    reset: function(playerNo) {                                    // serve from the side that just lost the point
      this.pong.trail = [];
      this.setpos(playerNo == 1 ? this.maxX : this.minX, Math.random() * (this.maxY - this.minY) + this.minY);
      this.dx = playerNo == 1 ? -this.speed : this.speed;
      this.dy = this.speed;
      this.launch();
    },

    // seconds for the ball to travel `dist` along x (it speeds up by `accel`, as in accelerate())
    flightTime: function(dist) {
      var v = Math.abs(this.dx), a = this.accel;
      return (Math.sqrt(v * v + 2 * a * dist) - v) / a;
    },

    // Work out the next flight, once per hit: real gravity, so the ball rises and falls along a parabola.
    // Launch speed and gravity are chosen so that it clears the net, lands on the table at bounceAt, and
    // arrives at the other paddle at hit height. (z = height above the table, vz = vertical speed)
    launch: function() {
      var W = this.pong.width, n = W * LOOK.tableEnd / 2, right = this.dx > 0;     // n = x of the net
      var xb = right ? n + LOOK.bounceAt * n : n - LOOK.bounceAt * n, xr = right ? W : 0;
      var T1 = this.flightTime(Math.abs(xb - this.x));               // hit -> bounce
      var Tn = this.flightTime(Math.abs(n - this.x));            // hit -> net
      var T2 = this.flightTime(Math.abs(xr - xb));                   // bounce -> receiver
      var z0 = LOOK.ballLift, s = Tn / T1;
      this.z  = z0;
      this.vz = (LOOK.netClear - z0 + z0 * s * s) / (T1 * (s - s * s));   // parabola through hit, net and bounce points
      this.g  = 2 * (z0 + this.vz * T1) / (T1 * T1);
      this.vz2 = (z0 + 0.5 * this.g * T2 * T2) / T2;                      // speed leaving the table, to reach hit height
      this.bounced = false;
    },

    setpos: function(x, y) {
      this.x = x;  this.y = y;
      this.left = x - this.radius;  this.right = x + this.radius;
    },

    update: function(dt, player, robot) {
      var pos = Pong.Helper.accelerate(this.x, this.y, this.dx, this.dy, this.accel, dt);

      if (pos.dy > 0 && pos.y > this.maxY) { pos.y = this.maxY;  pos.dy = -pos.dy; }   // side walls
      else if (pos.dy < 0 && pos.y < this.minY) { pos.y = this.minY;  pos.dy = -pos.dy; }

      var hit = false, paddle = pos.dx < 0 ? player : robot;
      var pt = Pong.Helper.ballIntercept(this, paddle, pos.nx, pos.ny);
      if (pt) {
        if (pt.d == 'left' || pt.d == 'right') { pos.x = pt.x;  pos.dx = -pos.dx;  this.pong.rally++;  hit = true; }   // a hit
        else                                   { pos.y = pt.y;  pos.dy = -pos.dy; }
        // add/remove spin based on paddle direction
        if (paddle.dir < 0)      pos.dy *= (pos.dy < 0 ? 0.5 : 1.5);
        else if (paddle.dir > 0) pos.dy *= (pos.dy > 0 ? 0.5 : 1.5);
      }

      this.setpos(pos.x, pos.y);
      this.dx = pos.dx;  this.dy = pos.dy;
      if (hit) this.launch();

      // vertical motion: gravity, one bounce on the table (losing some energy), then up to the receiver
      this.z += this.vz * dt - 0.5 * this.g * dt * dt;  this.vz -= this.g * dt;
      if (this.z <= 0 && this.vz < 0) { this.z = 0;  this.vz = this.bounced ? 0 : this.vz2;  this.bounced = true; }

      if (++this.frame % 3 == 0) {                                 // short trail of past positions
        this.pong.trail.push({ x: this.x, y: this.y, z: this.z });
        if (this.pong.trail.length > 6) this.pong.trail.shift();
      }
    }
  },

  //=============================================================================
  // HELPER (collision math, unchanged from the original)
  //=============================================================================

  Helper: {

    accelerate: function(x, y, dx, dy, accel, dt) {
      var x2  = x + (dt * dx) + (accel * dt * dt * 0.5);
      var y2  = y + (dt * dy) + (accel * dt * dt * 0.5);
      var dx2 = dx + (accel * dt) * (dx > 0 ? 1 : -1);
      var dy2 = dy + (accel * dt) * (dy > 0 ? 1 : -1);
      return { nx: x2 - x, ny: y2 - y, x: x2, y: y2, dx: dx2, dy: dy2 };
    },

    intercept: function(x1, y1, x2, y2, x3, y3, x4, y4, d) {
      var denom = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));
      if (denom != 0) {
        var ua = (((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3))) / denom;
        if (ua >= 0 && ua <= 1) {
          var ub = (((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3))) / denom;
          if (ub >= 0 && ub <= 1) return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1), d: d };
        }
      }
      return null;
    },

    ballIntercept: function(ball, rect, nx, ny) {
      var pt, I = Pong.Helper.intercept, r = ball.radius, x2 = ball.x + nx, y2 = ball.y + ny;
      if (nx < 0)      pt = I(ball.x, ball.y, x2, y2, rect.right + r, rect.top - r, rect.right + r, rect.bottom + r, 'right');
      else if (nx > 0) pt = I(ball.x, ball.y, x2, y2, rect.left - r,  rect.top - r, rect.left - r,  rect.bottom + r, 'left');
      if (!pt) {
        if (ny < 0)      pt = I(ball.x, ball.y, x2, y2, rect.left - r, rect.bottom + r, rect.right + r, rect.bottom + r, 'bottom');
        else if (ny > 0) pt = I(ball.x, ball.y, x2, y2, rect.left - r, rect.top - r,    rect.right + r, rect.top - r,    'top');
      }
      return pt;
    }
  }
};

//=============================================================================
// PAGE: canvas, input, controls, game loop
//=============================================================================

function $(id) { return document.getElementById(id); }

var canvas = $('game'), lastTime = Date.now();
function resize() { canvas.width = innerWidth;  canvas.height = innerHeight; }
addEventListener('resize', resize);  resize();

Pong.initialize(canvas);

addEventListener('keydown', function(e) { Pong.keys[e.key] = true;  if (e.key == 'r') Pong.reset(); });
addEventListener('keyup',   function(e) { Pong.keys[e.key] = false; });

// controls panel
function toggle(el, show) { el.style.display = (el.style.display == 'none' || !el.style.display) ? show : 'none'; }
$('controlsBtn').onclick = function() { toggle($('panel'), 'block'); };
$('aboutBtn').onclick    = function() { if (SCENES[Pong.scene].text) toggle($('text'), 'block'); };
$('scoreBtn').onclick    = function() { toggle($('score'), 'flex');  $('scoreBtn').textContent = $('score').style.display == 'none' ? 'Show' : 'Hide'; };
$('resetBtn').onclick    = function() { Pong.reset(); };
$('speed').oninput = function() { Pong.speed = +this.value;  $('speedVal').textContent = this.value; };
$('scale').oninput = function() { Pong.zoom  = +this.value;  $('scaleVal').textContent = this.value + '×'; };
$('score').style.display = 'flex';

(function loop() {
  var now = Date.now(), dt = Math.min((now - lastTime) / 1000, 0.05) * Pong.speed;
  lastTime = now;
  Pong.update(dt);
  Pong.draw(Pong.ctx, canvas.width, canvas.height);
  $('score0').textContent = Pong.scores[0];
  $('score1').textContent = Pong.scores[1];
  requestAnimationFrame(loop);
})();