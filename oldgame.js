//=============================================================================
// SETTINGS – the things you're most likely to tweak
//=============================================================================

// Look of the 3D view (all heights are fractions of the screen height)
var LOOK = {
  vanishX:    0.47,  // where the court narrows to, horizontally
  horizon:    0.40,  // ... and vertically
  ground:     0.90,  // screen position of the near edge of the court
  court:      0.90,  // court width at the near edge, as a fraction of screen width
  depth:      3,     // perspective strength: higher = far end is smaller
  netHeight:  0.22,  // height of the net
  paddleLift: 0.06,  // paddle height above the floor

  ballLift:   0.08,  // ball height when it leaves a paddle
  arc:        0.30,  // peak height of the first flight (must clear the net: > netHeight)
  bounceAt:   0.70,  // where it hits the table, as a fraction of the trip (0 = hitter, 1 = receiver)
  bounceArc:  0.12,  // peak height after the bounce (lower, because the bounce loses energy)
  ballFloor:  0.03   // ball height when it touches the table
};

// Background + text for each scene (switches every point). Use url(photo.jpg) for real images.
var SCENES = [
  { title: "Peter Lugar's",
    img:   "lugars.png",
    bg:    "linear-gradient(#cfe8cf, #a9b3a0 60%, #8a8a84)",
    text:  "" },
  { title: "112 Greene St.",
    img:   "greene.png",
    bg:    "linear-gradient(#9fd3d6, #b7b0a4 60%, #8d857c)",
    text:  "PERMITTED OBSTRUCTION" },
    { title: "williamsburg bridge",
    img:   "bike.gif",
    bg:    "linear-gradient(#9fd3d6, #b7b0a4 60%, #8d857c)",
    text:  "PERMITTED OBSTRUCTION" }
    
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
    this.keys = {};        this.trail = [];
    this.player = this.make(this.Paddle, false);
    this.robot  = this.make(this.Paddle, true);
    this.robot.auto = true;  this.robot.level = this.level(0);
    this.ball = this.make(this.Ball);
    this.ball.reset(1);
    this.showScene();
  },

  make: function(proto, arg) { var o = Object.create(proto); o.initialize(this, arg); return o; },

  goal: function(playerNo) {
    this.scores[playerNo]++;
    if (this.scores[playerNo] == 9) this.scores = [0, 0];
    this.scene = (this.scene + 1) % SCENES.length;
    this.showScene();
    this.ball.reset(playerNo);
    this.robot.level = this.level(this.scores[1] - this.scores[0]);
  },

  update: function(dt) {
    // you: arrow keys / A D, otherwise follow the mouse
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

    // ball height: hit -> over the net -> bounce on the far half of the table -> up to the receiver
  ballLift: function(x, dx) {
    var t = x / this.width, u = dx > 0 ? t : 1 - t;   // u: 0 = just hit, 1 = reaches the other player
    var a = LOOK.bounceAt, s, h;
    if (u < a) { s = u / a;            h = LOOK.ballLift * (1 - s) + LOOK.arc * 4 * s * (1 - s); }
    else       { s = (u - a) / (1 - a); h = LOOK.ballLift * s       + LOOK.bounceArc * 4 * s * (1 - s); }
    return LOOK.ballFloor + h;
  },

  draw: function(ctx, w, h) {
    var self = this, ball = this.ball, mid = this.project(this.width / 2, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffff';

    function drawNet() {                     // straight grid across the full screen
      var top = mid.y - LOOK.netHeight * h * mid.s, step = 60 * mid.k;
      ctx.lineWidth = 1.5;  ctx.beginPath();
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
  var c = self.project(b.x, b.y, self.ballLift(b.x, b.dx)), r = ball.radius * c.k;
  ctx.globalAlpha = (i == all.length - 1) ? 1 : 0.3;   // trail images are faint
  ctx.drawImage(BALL_IMG, c.x - r, c.y - r, r * 2, r * 2);
});
ctx.globalAlpha = 1;
    }

    this.robot.draw(ctx);
    if (ball.x > this.width / 2) { drawBall();  drawNet(); }   // ball behind the net
    else                         { drawNet();   drawBall(); }  // ball in front of it
    this.player.draw(ctx);
  },

  showScene: function() {
    var s = SCENES[this.scene];
    $('bg').style.background = s.img ? 'url(' + s.img + ') center / cover, ' + s.bg : s.bg;
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
  var w = this.height * c.k;                        // image width on screen (shrinks with distance)
  var h = w * PADDLE_IMG.height / PADDLE_IMG.width; // keep the image's proportions
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(this.x ? 0.35 : -0.35);                // tilt; set to 0 for no tilt
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
    },

    setpos: function(x, y) {
      this.x = x;  this.y = y;
      this.left = x - this.radius;  this.right = x + this.radius;
    },

    update: function(dt, player, robot) {
      var pos = Pong.Helper.accelerate(this.x, this.y, this.dx, this.dy, this.accel, dt);

      if (pos.dy > 0 && pos.y > this.maxY) { pos.y = this.maxY;  pos.dy = -pos.dy; }   // side walls
      else if (pos.dy < 0 && pos.y < this.minY) { pos.y = this.minY;  pos.dy = -pos.dy; }

      var paddle = pos.dx < 0 ? player : robot;
      var pt = Pong.Helper.ballIntercept(this, paddle, pos.nx, pos.ny);
      if (pt) {
        if (pt.d == 'left' || pt.d == 'right') { pos.x = pt.x;  pos.dx = -pos.dx; }
        else                                   { pos.y = pt.y;  pos.dy = -pos.dy; }
        // add/remove spin based on paddle direction
        if (paddle.dir < 0)      pos.dy *= (pos.dy < 0 ? 0.5 : 1.5);
        else if (paddle.dir > 0) pos.dy *= (pos.dy > 0 ? 0.5 : 1.5);
      }

      this.setpos(pos.x, pos.y);
      this.dx = pos.dx;  this.dy = pos.dy;

      if (++this.frame % 5 == 0) {                                 // short trail of past positions
        this.pong.trail.push({ x: this.x, y: this.y, dx: this.dx });
        if (this.pong.trail.length > 5) this.pong.trail.shift();
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

addEventListener('keydown', function(e) { Pong.keys[e.key] = true; });
addEventListener('keyup',   function(e) { Pong.keys[e.key] = false; });


// controls panel
function toggle(el, show) { el.style.display = (el.style.display == 'none' || !el.style.display) ? show : 'none'; }
$('controlsBtn').onclick = function() { toggle($('panel'), 'block'); };
$('aboutBtn').onclick    = function() { if (SCENES[Pong.scene].text) toggle($('text'), 'block'); };
$('scoreBtn').onclick    = function() { toggle($('score'), 'flex');  $('scoreBtn').textContent = $('score').style.display == 'none' ? 'Show' : 'Hide'; };
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
