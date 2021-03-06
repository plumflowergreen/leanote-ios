var fs = {}; // require('fs');
// var User = require('user');
// var Evt = require('evt');
var ObjectId = require('./objectid');

// var gui = require('nw.gui');
// console.log(gui.App);

// 开发版
/*
process.on('uncaughtException', function (err) {
  // 打印出错误
  console.log('~!!~ uncaughtException ~!!~');
  console.log(err);
  // 打印出错误的调用栈方便调试
  console.log(err.stack);
  // Web = require('web');
  // Web.debug('错误!!');
});
*/

function log(o) {console.log(o)}
// log("<>>>>>>>>>>>>>>>>>>>>");
var Common = {
	objectId: function() {
		return ObjectId()
	},
	_uuid: 1,
	uuid: function() {
		this._uuid++;
		return ((new Date()).getTime()) + '_' + this._uuid;
	},
	isWin: function() {
		return process.platform.toLowerCase().indexOf('win') === 0;
	},
	isMac: function() {
		return process.platform.toLowerCase().indexOf('mac') === 0;
	},
	// 得到目录分隔符
	getPathSep: function() {
		// windows下
		if(process.platform.toLowerCase().indexOf('win') === 0) {
			return "\\";
		}
		// linux下
		return '/';
	},
	isOk: function(ret) {
		if(!ret) {
			return ret;
		}
	
		if(typeof ret == 'object') {
			// 数组
			if('length' in ret) {
				return true;
			}
			if('Ok' in ret && !ret.Ok) { // 指明了Ok
				return false;
			}
			return true;
		}
		return false;
	},
	// 复制文件
	copyFile: function(src, dist, callback) {
		if(!src || !dist) {
			return callback && callback(false);
		}
		var readStream = fs.createReadStream(src);
		var writeStream = fs.createWriteStream(dist);
		readStream.pipe(writeStream);
		readStream.on('end', function () {
			callback && callback(true);
		});
		readStream.on('error', function () {
			callback && callback(false);
		});
	},
	inArray: function(arr, item) {
		var me = this;
		if(!arr) {
			return false;
		}
		for(var i = 0; i < arr.length; i++) {
			if(arr[i] == item) {
				return true;
			}
		}
		return false;
	},
	isImageExt: function(ext) {
		var me = this;
		if(!ext) {
			return false;
		}
		ext = ext.toLowerCase();
		return me.inArray(['jpg', 'jpeg', 'bmp', 'png', 'gif'], ext);
	},
	// 拆分filePath的各个部分
	splitFile: function(fullFilePath) {
		var ret = {
			path: "", // a/b
			name: "", // c.js
			nameNotExt: "", // a
			ext: "", // js
			getFullPath: function() {
				var me = this;
				if(me.path) {
					if(me.ext) {
						return me.path + '/' + me.nameNotExt + '.' + me.ext;
					} else {
						return me.path + '/' + me.nameNotExt;
					}
				} else {
					if(me.ext) {
						return me.nameNotExt + '.' + me.ext;
					} else {
						return me.nameNotExt;
					}
				}
			}
		}
		if(!fullFilePath) {
			return ret;
		}
		var strs = fullFilePath.split(this.getPathSep());
		if(strs.length == 1) {
			ret.name = strs[0];
		} else {
			ret.name = strs[strs.length - 1];
			strs.pop();
			ret.path = strs.join('/');
		}
		// console.log("---");
		// console.log(ret);
		var names = ret.name.split('.');
		if(names.length > 1) {
			ret.ext = names[names.length - 1];
			names.pop();
			ret.nameNotExt = names.join('.');
		} else {
			ret.nameNotExt = ret.name;
		}
		return ret;
	},
	// 2014-01-06T18:29:48.802+08:00
	goNowToDate: function (goNow) {
		if(!goNow) {
			return new Date();
		}
		// new Date();
		if(typeof goNow == 'object') {
			return date;
		}
		var str = goNow.substr(0, 10) + " " + goNow.substr(11, 8);
		str = str.replace(/-/g, '/');
		try {
			return new Date(str);
		} catch(e) {
			return new Date();
		}
	},

	// 获取文件的json数据
	getFileJson: function(filepath) {
		var me = this;
		try {
			var data = fs.readFileSync(filepath, 'utf-8');
			return JSON.parse(data);
		} catch(e) { 
			return false;
		}
	},

	writeFile: function(filepath, data) {
		var me = this;
		try {
			fs.writeFileSync(filepath, data);
			return true;
		} catch(e) { 
			return false;
		}
	},

	// 执行命令
	cmd: function(args, exitFunc) {
		var me = this;
		var exec = require('child_process').exec;
		var binPath = process.cwd() + '/public/bin/leanote-mac';
		if(me.isWin()) { 
			var binPath = process.cwd() + '/public/bin/leanote.exe';
			go();
		} else {
			// 先chmod +x
			var chmod = exec('chmod +x "' + binPath + '"');
			chmod.on('exit', function(code) { 
				go();
			});
		}

		function go() {
			var cmd = '"' + binPath + '"'; // "' + txtPath + '" "' + filePath + '"'
			for(var i in args) {
				cmd += ' "' + args[i] + '"';
			}

			last = exec(cmd); 
			last.on('exit', exitFunc);
		}
	}
};
module.exports = Common; 
