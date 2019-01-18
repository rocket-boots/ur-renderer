var renderer = (function(){

let gl;
const _math = Math;
const renderer = {
	bufferData: null,
	lightData: null,
	lightUniform: null,
	cameraUniform: null,
	textureSize: 1024,
	tileSize: 16,
	halfTileSize: 8,
	tileFraction: 0,
	pxNudge: 0,
	verts: 0, // number of verts
	lights: 0, // number of lights
	levelVerts: 0,

	defaultOptions: {
		canvasId: 'c',
		shaderAttributeVec: 'attribute vec',
		shaderVarying: 
			'precision highp float;' +
			'varying vec3 vl;' +
			'varying vec2 vuv;'
		,
		shaderUniform: 'uniform ',
		shaderConstMat4: "const mat4 ",
		maxLights: 16,
	},

	clearVerts: function() {
		return this.setVerts(0);
	},
	clearLights: function() {
		this.lights = 0;
		return this;
	},
	setVerts: function(v) {
		this.verts = v;
		return this;
	},
	setLevelVerts: function(v) {
		this.levelVerts = v;
		return this;
	},

	setBufferData: function(maxVerts) {
		maxVerts = maxVerts || (1024 * 64);
		this.bufferData = new Float32Array(maxVerts*8); // allow 64k verts, 8 properties per vert
	},
	setLightData: function(maxLights) {
		this.lightData = new Float32Array(maxLights * 7); // 32 lights, 7 properties per light
	},
	setSize(textureSize, tileSize) {
		const r = this;
		r.textureSize = textureSize;
		r.tileSize = tileSize;
		r.halfTileSize = tileSize / 2;
		r.tileFraction = tileSize / textureSize;
		r.pxNudge = 0.5 / textureSize;
	},

	getVertextShader: function(options) {
		return (
			options.shaderVarying + 
			options.shaderAttributeVec + "3 p;" +
			options.shaderAttributeVec + "2 uv;" +
			options.shaderAttributeVec + "3 n;" +
			options.shaderUniform + "vec3 cam;" +
			options.shaderUniform + "float l[7*" + options.maxLights + "];" +
			options.shaderConstMat4 + "v=mat4(1,0,0,0,0,.707,.707,0,0,-.707,.707,0,0,-22.627,-22.627,1);" + // view
			options.shaderConstMat4 + "r=mat4(.977,0,0,0,0,1.303,0,0,0,0,-1,-1,0,0,-2,0);"+ // projection
			"void main(void){" +
				"vl=vec3(0.3,0.3,0.6);" + // ambient color
				"for(int i=0; i<" + options.maxLights + "; i++) {"+
					"vec3 lp=vec3(l[i*7],l[i*7+1],l[i*7+2]);" + // light position
					"vl+=vec3(l[i*7+3],l[i*7+4],l[i*7+5])" + // light color *
						"*max(dot(n,normalize(lp-p)),0.)" + // diffuse *
						"*(1./(l[i*7+6]*(" + // attentuation *
							"length(lp-p)" + // distance
						")));" + 
				"}" +
				"vuv=uv;" +
				"gl_Position=r*v*(vec4(p+cam,1.));" +
			"}"
		);
	},

	getFragmentShader: function(options) {
		return (
			options.shaderVarying + 
			options.shaderUniform + "sampler2D s;" +
			"void main(void){" +
				"vec4 t=texture2D(s,vuv);" +
				"if(t.a<.8)" + // 1) discard alpha
					"discard;" + 
				"if(t.r>0.95&&t.g>0.25&&t.b==0.0)" + // 2) red glowing spider eyes
					"gl_FragColor=t;" +
				"else{" +  // 3) calculate color with lights and fog
					"gl_FragColor=t*vec4(vl,1.);" +
					"gl_FragColor.rgb*=smoothstep(" +
						"112.,16.," + // fog far, near
						"gl_FragCoord.z/gl_FragCoord.w" + // fog depth
					");" +
				"}" +
				"gl_FragColor.rgb=floor(gl_FragColor.rgb*6.35)/6.35;" + // reduce colors to ~256
			"}"
		);	
	},

	addWebGLShorthand: function(gl) {
		// Create shorthand WebGL function names
		// var webglShortFunctionNames = {};
		for (var name in gl) {
			if (gl[name].length !== undefined) {
				gl[name.match(/(^..|[A-Z]|\d.|v$)/g).join('')] = gl[name];
				// webglShortFunctionNames[name] = 'gl.'+name.match(/(^..|[A-Z]|\d.|v$)/g).join('');
			}
		}
		// console.log(JSON.stringify(webglShortFunctionNames, null, '\t'));
	},

	init: function(options) {
		const r = this;
		options = Object.assign({}, r.defaultOptions, options);
		console.log(options);

		const c = options.canvas || document.getElementById(options.canvasId);
		gl = c.getContext('webgl') || c.getContext('experimental-webgl');
		r.addWebGLShorthand(gl);

		r.setBufferData();
		r.setSize(1024, 16);
		r.maxLights = options.maxLights;
		r.setLightData(options.maxLights);

		const vertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, r.bufferData, gl.DYNAMIC_DRAW);

		r.shaderProgram = gl.createProgram();
		gl.attachShader(r.shaderProgram, r.compileShader(gl.VERTEX_SHADER, r.getVertextShader(options)));
		gl.attachShader(r.shaderProgram, r.compileShader(gl.FRAGMENT_SHADER, r.getFragmentShader(options)));
		gl.linkProgram(r.shaderProgram);
		gl.useProgram(r.shaderProgram);

		r.cameraUniform = gl.getUniformLocation(r.shaderProgram, "cam");
		r.lightUniform = gl.getUniformLocation(r.shaderProgram, "l");

		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.viewport(0,0,c.width,c.height);

		r.enableVertexAttrib('p', 3, 8, 0);
		r.enableVertexAttrib('uv', 2, 8, 3);
		r.enableVertexAttrib('n', 3, 8, 5);
	},

	bindImage: function (image) {
		const tex2d = gl.TEXTURE_2D;
		gl.bindTexture(tex2d, gl.createTexture());
		gl.texImage2D(tex2d, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		gl.texParameteri(tex2d, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(tex2d, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(tex2d, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(tex2d, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	},

	compileShader: function (shaderType, shaderSource) {
		const shader = gl.createShader(shaderType);
		gl.shaderSource(shader, shaderSource);
		gl.compileShader(shader);
		// console.log(gl.getShaderInfoLog(shader));
		return shader;
	},

	enableVertexAttrib: function (attribName, count, vertexSize, offset) {
		const r = this;
		var location = gl.getAttribLocation(r.shaderProgram, attribName);
		gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(location, count, gl.FLOAT, false, vertexSize * 4, offset * 4);
	},

	pushLight: function(x, y, z, r, g, b, falloff) {
		const o = this;
		// Only push lights near to the camera
		var maxLightDistance = (128 + 1/falloff); // cheap ass approximation
		if (
			o.lights < o.maxLights &&
			_math.abs(-x - camera.x) < maxLightDistance &&
			_math.abs(-z - camera.z) < maxLightDistance
		) {
			o.lightData.set([x, y, z, r, g, b, falloff], o.lights*7);
			o.lights++;
		}
	},

	prepareFrame: function () {
		const r = this;
		r.setVerts(r.levelVerts).clearLights();
		// reset all lights
		r.lightData.fill(1);
	},

	endFrame: function () {
		const r = this;
		gl.uniform3f(r.cameraUniform, camera.x, camera.y - 10, camera.z - 30);
		gl.uniform1fv(r.lightUniform, r.lightData);
	
		gl.clearColor(0,0,0,1);
		gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	
		gl.bufferData(gl.ARRAY_BUFFER, r.bufferData, gl.DYNAMIC_DRAW);
		gl.drawArrays(gl.TRIANGLES, 0, r.verts);
	},

	// Pushes

	pushQuad(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, nx, ny, nz, tile) {
		const r = this;
		const u = tile * r.tileFraction + r.pxNudge;
		const u2 = u + r.tileFraction - r.pxNudge;
		r.bufferData.set([
			x1, y1, z1, u, 0, nx, ny, nz,
			x2, y2, z2, u2, 0, nx, ny, nz,
			x3, y3, z3, u, 1, nx, ny, nz,
			x2, y2, z2, u2, 0, nx, ny, nz,
			x3, y3, z3, u, 1, nx, ny, nz,
			x4, y4, z4, u2, 1, nx, ny, nz
		], r.verts * 8);
		r.verts += 6;
	},

	pushSprite: function (x, y, z, tile) {
		// Only push sprites near to the camera
		if (
			_math.abs(-x - camera.x) < 128 && 
			_math.abs(-z - camera.z) < 128
		) {
			var tilt = 3 + (camera.z + z) / 12; // tilt sprite when closer to camera
			this.pushQuad(x, y + 6, z, x + 6, y + 6, z, x, y, z + tilt, x + 6, y, z + tilt, 0, 0, 1, tile);
		}
	},
	
	pushFloor: function (x, z, tile) {
		this.pushQuad(x, 0, z, x + 8, 0, z, x, 0, z + 8, x + 8, 0, z + 8, 0,1,0, tile);
	},
	
	pushBlock: function (x, z, y = 8, tileTop, tileSites) {
		const r = this;
		const x2 = x + 8;
		const z2 = z + 8;
		r.pushQuad(x, y, z, x2, y, z, x, y, z2, x2, y, z2, 0, 1, 0, tileTop); // top
		r.pushQuad(x2, y, z, x2, y, z2, x2, 0, z, x2, 0, z2, 1, 0, 0, tileSites); // right
		r.pushQuad(x, y, z2, x2, y, z2, x, 0, z2, x2, 0, z2, 0, 0, 1, tileSites); // front
		r.pushQuad(x, y, z, x, y, z2, x, 0, z, x, 0, z2, -1, 0, 0, tileSites); // left
	}
};
return renderer;

})();
