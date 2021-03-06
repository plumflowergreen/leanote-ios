// 来自desktop-app
// 待修改

var db = require('../DB/Sqlite');

var async = require('async');

var fs = {}; // require('fs');
var File = {}; // require('file');
var Evt = require('./evt');
var User = require('./user');
var Notebook = require('./notebook');
// var Tag = require('tag');
// var Api = require('api');
var Common = require('./common');
var Web = require('./web');

// db
var Notes = db.notes;

var Api = null; // require('api')
var Tag = null;

function log(o) {
	console.log(o);
}

// Web.alertWeb('alert(process.type);');

/*
type NoteOrContent struct {
	NotebookId string
	NoteId string
	UserId string
	Title string
	Desc string
	ImgSrc string
	Tags []string
	Content string
	Abstract string
	IsNew bool
	IsMarkdown bool
	FromUserId string // 为共享而新建
	IsBlog bool // 是否是blog, 更新note不需要修改, 添加note时才有可能用到, 此时需要判断notebook是否设为Blog
}
*/

// 笔记服务
var Note = {
	// 更新笔记
	updateNoteOrContent: function(noteOrContent, callback) {
		var me = this;

		// Web.alertWeb(process.type); // render

		var userId = User.getCurActiveUserId();
		noteOrContent['UserId'] = userId;

		// console.error("updateNoteOrContent")
		// console.trace('updateNoteOrContent: ');
		// console.log(noteOrContent);

		var date = new Date();
		noteOrContent.UpdatedTime = date;

		noteOrContent['IsDirty'] = true; // 已修改
		noteOrContent['LocalIsDelete'] = false;

		// 新建笔记, IsNew还是保存着
		if(noteOrContent.IsNew) {
			noteOrContent.CreatedTime = date;
			noteOrContent['IsTrash'] = false;
			delete noteOrContent['IsNew'];
			noteOrContent['LocalIsNew'] = true;
			Notes.insert(noteOrContent, function (err, newDoc) {   // Callback is optional
				if(err) {
					console.log(err);
					callback && callback(false);
				} else {
					// 为什么又设置成true, 因为js的对象是共享的, callback用到了noteOrContent.IsNew来做判断
					noteOrContent['IsNew'] = true;
					callback && callback(newDoc);

					// 重新统计笔记本的笔记数量
					Notebook.reCountNotebookNumberNotes(noteOrContent.NotebookId);

					me.addNoteHistory(noteOrContent.NoteId, noteOrContent.Content);

					/*
					// 标签
					if(noteOrContent.Tags && noteOrContent.Tags.length > 0) {
						Tag.addTags(noteOrContent.Tags);
					}
					*/
				}
			});
		// 更新笔记
		} else {
			var updateFields = ['Desc', 'ImgSrc', 'Title', 'Tags', 'Content'];
			var updates = {};
			var needUpdate = false;
			for(var i in updateFields) {
				var field = updateFields[i];
				if(field in noteOrContent) {
					updates[field] = noteOrContent[field];
					needUpdate = true;
				}
			}
			
			if(needUpdate) {
				var isDirty = false;
				me.getNote(noteOrContent.NoteId, function(dbNote) {
					// 只有title, Content, Tags修改了才算是IsDirty
					if('Content' in updates && dbNote['Content'] != updates['Content']) {
						isDirty = true;
						// console.error(' content not same');

						// ContentIsDirty 才会发Content
						updates['ContentIsDirty'] = true;

					} else if('Title' in updates && dbNote['Title'] != updates['Title']) {
						isDirty = true;
						console.error(' title not same');
					} else if('Tags' in updates) {
						var dbTags = dbNote['Tags'] || [];
						var nowTags = updates['Tags'] || [];
						if(dbTags.join(',') != nowTags.join(',')) {
							isDirty = true;
							console.error(' tag not same');
						}
					}

					// 没有任何修改
					if(!isDirty) {
						console.log('没有任何修改, 不保存');
						return callback && callback(dbNote);
					}

					updates['IsDirty'] = isDirty;

					updates['LocalIsDelete'] = false;
					
					if(isDirty) {
						updates.UpdatedTime = date;
					}

					// console.log('finally update:');
					// console.log(updates);

					// Set an existing field's value 
					Notes.update({NoteId: noteOrContent.NoteId}, updates, {}, function (err, numReplaced) { 
						if(err) {
							callback && callback(false);
						} else {
							callback && callback(noteOrContent);

							if('Content' in updates) {
								me.addNoteHistory(noteOrContent.NoteId, noteOrContent.Content);
							}
						}
					});

				});
			}
		}
	},

	// 公开/取消为博客
	setNote2Blog: function(noteId, isBlog, callback) {
		var me = this;
		me.getNote(noteId, function(note) {
			if(note) {
				if(note.IsBlog == isBlog) {
					return callback && callback(true);
				}
				// 更新, 设置isDirty
				Notes.update({NoteId: noteId}, {IsBlog: isBlog, IsDirty: true}, {}, function (err, numReplaced) { 
					return callback && callback(true);
				});
			} else {
				return callback && callback(false);
			}
		});
	},

	// 添加笔记历史
	/*
	type NoteContentHistory struct {
		NoteId    bson.ObjectId `bson:"_id,omitempty"`
		UserId    bson.ObjectId `bson:"UserId"` // 所属者
		Histories []EachHistory `Histories`
	}
	 */
	addNoteHistory: function(noteId, content) {
		var me = this;
		// 先判断是否存在, 不存在则新建之
		db.noteHistories.findOne({_id: noteId}, function(err, history) {
			// 新建之
			if(!history) {
				db.noteHistories.insert({_id: noteId, Histories: [content], "UpdatedTime": new Date()});
			}
			// 更新之
			else {
				var histories = history.Histories;
				histories.push(content);
				db.noteHistories.update({_id: noteId}, {Histories: histories, "UpdatedTime": new Date()});
			}
		});
	},
	// 获取笔记历史记录
	getNoteHistories: function(noteId, callback) {
		var me = this;
		db.noteHistories.findOne({_id: noteId}, function(err, doc) {
			if(err || !doc) {
				callback(false);
			}
			else {
				var histories = [];
				for(var i = doc.Histories.length - 1; i >= 0; --i) {
					histories.push({Content: doc.Histories[i], UpdatedTime: doc.UpdatedTime || new Date()});
				}
				callback(histories);
			}
		});
	},

	// 获取笔记列表
	getNotes: function(notebookId, callback) {
		var me = this;
		me._getNotes(notebookId, false, false, callback);
	},
	// 获取trash笔记
	getTrashNotes: function(callback) {
		var me = this;
		me._getNotes('', true, false, callback);
	},
	getStarNotes: function(callback) {
		var me = this;
		me._getNotes('', false, true, callback);
	},
	_getNotes: function(notebookId, isTrash, isStar, callback) {
		var userId = User.getCurActiveUserId();
		var query = {
			UserId: userId,
			IsTrash: false,
			LocalIsDelete: false, // 未删除的
		};
		if(isStar) {
			query['Star'] = true;
		}
		if(notebookId) {
			query['NotebookId'] = notebookId;
		}
		if(isTrash) {
			query['IsTrash'] = true;
		}
		Notes.find(query).sort({'UpdatedTime': -1}).exec(function(err, notes) {
			// console.log('error ' + err);
			if(err) {
				return callback && callback(false);
			}
			// console.log(notes);
			return callback && callback(notes);
		});
	},

	searchNote: function(key, callback) {
		var reg = new RegExp(key);
		var userId = User.getCurActiveUserId();
		Notes.find({UserId: userId, IsTrash: false, LocalIsDelete: false, $or: [{Title: reg}, {Content: reg}]}).sort({'UpdatedTime': -1}).exec(function(err, notes) {
			if(!err && notes) {
				console.log('search ' + key + ' result: ' + notes.length);
				callback(notes);
			} else {
				callback([]);
			}
		});
	},

	searchNoteByTag: function(tag, callback) {
		var userId = User.getCurActiveUserId();
		Notes.find({UserId: userId, IsTrash: false, LocalIsDelete: false, Tags: {$in: [tag]}}).sort({'UpdatedTime': -1}).exec(function(err, notes) {
			if(!err && notes) {
				console.log('search by tag: ' + tag + ' result: ' + notes.length);
				callback(notes);
			} else {
				callback([]);
			}
		});
	},

	clearTrash: function(callback) {
		var me = this;
		var userId = User.getCurActiveUserId();
		Notes.update(
			{UserId: userId, IsTrash: true}, 
			{LocalIsDelete: true, IsDirty: true}, 
			{multi: true}, 
			function(err, n) {
				// Web.alertWeb(n);
				callback && callback();
		});
	},

	deleteNote: function(noteId, callback) {
		var me = this;
		me.getNote(noteId, function(note) {
			if(!note) {
				callback(false);
			}
			Notes.update({NoteId: noteId}, {IsTrash: true, IsDirty: true}, function(err, n) {
				if(err || !n) {
					callback(false);
				} else {
					callback(true);

					// 重新统计
					Notebook.reCountNotebookNumberNotes(note.NotebookId);
				}
			});
		});
	},
	// 是新的, 又是deleted的, 则删除之
	deleteLocalNote: function(noteId, callback) {
		Notes.remove({NoteId: noteId}, function() {
			callback && callback();
		});
	},
	// 彻底删除笔记, 如果有tags, 则需要更新tags's count
	deleteTrash: function(noteId, callback) {
		var me = this;
		me.getNote(noteId, function(note) {
			if(note) {
				note.LocalIsDelete = true;
				note.IsDirty = true;

				// TODO 删除附件

				Notes.update({_id: note._id}, {IsDirty: true, LocalIsDelete: true}, function(err, n) {
					if(n) {
						// 如果有tags, 则重新更新tags' count
						me.updateTagCount(note.Tags);
					}
				});
			} else {
				callback(false);
			}
		});

		/*
		Notes.update({NoteId: noteId}, {$set: {IsDirty: true, LocalIsDelete: true}}, function(err, n) {
			if(err || !n) {
				callback(false);
			} else {
				callback(true);
			}
		});
		*/
	},

	// 移动note
	// 重新统计另一个notebookId的笔记数
	moveNote: function(noteId, notebookId, callback) {
		var me = this;
		me.getNote(noteId, function(note) {
			if(note) {
				var to = !note.Star;
				var preNotebookId = note.NotebookId;
				note.NotebookId = notebookId;
				Notes.update({_id: note._id}, {NotebookId: notebookId, IsTrash: false, LocalIsDelete: false, UpdatedTime: new Date()}, function(err, n) {
					// 重新统计
					Notebook.reCountNotebookNumberNotes(preNotebookId);
					Notebook.reCountNotebookNumberNotes(notebookId);
					callback(note);
				});
			} else {
				callback(false);
			}
		});
	},

	// 加星或取消
	star: function(noteId, callback) {
		var me = this;
		me.getNote(noteId, function(note) {
			if(note) {
				var to = !note.Star;
				Notes.update({_id: note._id}, {Star: to, UpdatedTime: new Date()});
				callback(true, to);
			}
		});
	},

	conflictIsFixed: function(noteId) {
		var me = this;
		Notes.update({NoteId: noteId}, {ConflictNoteId: ""});
	},

	// 笔记本下是否有笔记
	hasNotes: function(notebookId, callback) {
		Notes.count({NotebookId: notebookId, IsTrash: false, LocalIsDelete: false}, function(err, n) {
			console.log(n);
			if(err || n > 0) {
				return callback(true);
			}
			callback(false);
		});
	},

	// 得到笔记
	getNote: function(noteId, callback) {
		var me = this;
		Notes.findOne({NoteId: noteId}, function(err, doc) {
			if(err || !doc) {
				log('不存在');
				callback && callback(false);
			} else {
				callback && callback(doc);
			}
		});
	},

	// 服务器上的数据到本地
	fixNoteContent: function(content) {
		if(!content) {
			return content;
		}
		// http://leanote.com/file/outputImage?fileId=54f9079f38f4115c0200001b
		var reg0 = new RegExp(Evt.leanoteUrl + '/file/outputImage', 'g');
		content = content.replace(reg0, Evt.localUrl + '/api/file/getImage');

		var reg = new RegExp(Evt.leanoteUrl + '/api/file/getImage', 'g');
		content = content.replace(reg, Evt.localUrl + '/api/file/getImage');

		var reg2 = new RegExp(Evt.leanoteUrl + '/api/file/getAttach', 'g');
		content = content.replace(reg2, Evt.localUrl + '/api/file/getAttach');

		// api/file/getAllAttachs?noteId=xxxxxxxxx, 这里的noteId是服务器上的noteId啊
		var reg3 = new RegExp(Evt.leanoteUrl + '/api/file/getAllAttachs', 'g');
		content = content.replace(reg3, Evt.localUrl + '/api/file/getAllAttachs');

		return content;
	},

	// 将本地的url改下, 发送数据到服务器上
	fixNoteContentForSend: function(content) {
		if(!content) {
			return content;
		}
		// console.log(Evt.localUrl + '/api/file/getImage');
		// console.log(content);
		var reg = new RegExp(Evt.localUrl + '/api/file/getImage', 'g');
		content = content.replace(reg, Evt.leanoteUrl + '/api/file/getImage');

		var reg2 = new RegExp(Evt.localUrl + '/api/file/getAttach', 'g');
		content = content.replace(reg2, Evt.leanoteUrl + '/api/file/getAttach');

		var reg3 = new RegExp(Evt.localUrl + '/api/file/getAllAttachs', 'g');
		content = content.replace(reg3, Evt.leanoteUrl + '/api/file/getAllAttachs');

		return content;
	},

	// 远程修改本地内容
	updateNoteContentForce: function(noteId, content, callback) {
		var me = this;

		content = me.fixNoteContent(content);

		Notes.update({NoteId: noteId},  {Content: content, InitSync: false, IsContentDirty: false} , {}, function (err, numReplaced) { 
			if(err) {
				log(err);
				callback && callback(false);
			} else {
				callback && callback(content);
			}
		});
	},

	/*
	// 同步内容
	updateNoteContentForce: function(noteId, content, callback) {
		// 将笔记内容中

		Notes.update({NoteId: noteId}, { $set: {Content: content, InitSync: false} }, {}, function (err, numReplaced) { 
			if(err) {
				log(err);
				callback && callback(false);
			} else {
				callback && callback(content);
			}
		});
	},
	*/

	// 得到笔记内容
	// noteId是本地Id
	inSyncContent: {}, // 正在同步中的
	inSyncTimes: {}, // 10次就要再尝试了
	getNoteContent: function(noteId, callback) {
		var me = this;
		console.log('getNoteContent------' + noteId);
		// 如果是正在sync的话, 返回
		/*
		if(me.inSyncContent[noteId]) {
			console.log('in sync now' + noteId); // 下周分享 node-webkit
			return;
		}
		*/
		me.inSyncContent[noteId] = true;
		me.inSyncTimes[noteId]++;
		if(me.inSyncTimes[noteId] > 10) {
			callback && callback(false);
		}

		me.getNote(noteId, function(note) {
			
			if(!Common.isOk(note)) {
				me.inSyncContent[noteId] = false;
				console.log('not ok');
				console.log(note);
				callback && callback(false);
			} else {
				// 如果笔记是刚同步过来的, 那么内容要重新获取
				if(note.InitSync) {
					console.log('need load from server');

					if(!Api) {
						Api = require('./api')
					}

					var serverNoteId = note.ServerNoteId;

					// 远程获取
					// me.getServerNoteIdByNoteId(noteId, function(serverNoteId) {
						if(!serverNoteId) {
							console.error(noteId + ' getServerNoteIdByNoteId error');
							me.inSyncContent[noteId] = false;
							return callback && callback(false);
						}

						Api.getNoteContent(serverNoteId, function(noteContent) {
							me.inSyncContent[noteId] = false;

							// 同步到本地
							if(Common.isOk(noteContent)) {
								me.updateNoteContentForce(noteId, noteContent.Content, function(content) {
									noteContent.Content = content;
									noteContent.NoteId = noteId;
									callback && callback(noteContent);
								});
							} else {

								console.error(noteId + ' api.getNoteContent error');

								// 这里, 可能太多的要同步了
								setTimeout(function() {
									me.getNoteContent(noteId, callback);
								}, 500);

								// callback && callback(false);
							}
						});

					// });
				} else {
					me.inSyncContent[noteId] = false;
					console.log('not need');
					callback && callback(note);

					// Web.alertWeb("NONO");
				}
			}
		});
	},

	//----------------
	// 同步 
	//----------------

	getNoteByServerNoteId: function(noteId, callback) {
		var me = this;
		console.log('llll>>lll');
		Notes.find({ServerNoteId: noteId}, function(err, doc) {
			// console.log(doc.length + '...');
			console.log('haha>>lll');
			console.log(err);
			// console.log(doc);
			if(doc && doc.length > 1) {
				console.error(doc.length + '. ..');
				console.log('note length: ' + doc.length + '. ..');
			}
			if(err || !doc) {
				log('getNoteByServerNoteId 不存在' + noteId);
				callback && callback(false);
			} else {
				doc = doc[0];
				callback && callback(doc);
			}
		});
	},
	getNoteIdByServerNoteId: function(noteId, callback) {
		var me = this;
		Notes.findOne({ServerNoteId: noteId}, function(err, doc) {
			if(err || !doc) {
				log('getNoteIdByServerNoteId 不存在' + noteId);
				callback && callback(false);
			} else {
				callback && callback(doc.NoteId);
			}
		});
	},
	getServerNoteIdByNoteId: function(noteId, callback) {
		var me = this;
		Notes.findOne({NoteId: noteId}, function(err, doc) {
			if(err || !doc) {
				log('getServerNoteIdByNoteId 不存在');
				callback && callback(false);
			} else {
				callback && callback(doc.ServerNoteId);
			}
		});
	},

	// 强制删除
	// TODO 是否真的删除 ?
	// 有可能服务器上删除了是误删 ?
	deleteNoteForce: function(noteId, callback) {
		var me = this;
		me.getNoteByServerNoteId(noteId, function(note) {
			if(!note) {
				callback && callback(false);
				return;
			}

			Notes.remove({_id: note._id}, function(err, n) {
				if(err) { 
					callback && callback(false);
				} else {
					Notebook.reCountNotebookNumberNotes(note.NotebookId);
					callback && callback(true);
				}
			});
		});
	},
	// 添加笔记本, note object
	// note是服务器传过来的, 需要处理下fix
	// NoteId, ServerNoteId, NotebookId(本地的)
	addNoteForce: function(note, callback) {
		var me = this;
		note.InitSync = true; // 刚同步完, 表示content, images, attach没有同步
		note.IsDirty = false;
		note.LocalIsDelete = false;
		note.IsTrash = false;
		
		note.ServerNoteId = note.NoteId;
		note.NoteId = Common.objectId();
		
		console.error('add note force' +  note.Title + Common.goNowToDate(note.CreatedTime));

		note.CreatedTime = Common.goNowToDate(note.CreatedTime);
		note.UpdatedTime = Common.goNowToDate(note.UpdatedTime);

		// 附件操作
		// TODO IOS
		var files = note.Files || [];
		var attachs = [];
		for(var i in files) {
			var file = files[i];
			if (!file) {
				continue;
			}
			if(file.IsAttach) { // LocalFileId, FileId
				file.ServerFileId = file.FileId;
				file.FileId = file.ServerFileId; // 弄成一样的, 只是没有Path
				attachs.push(file);
			}
		}
		note.Attachs = attachs;
		delete note['Files'];

		Notebook.getNotebookIdByServerNotebookId(note.NotebookId, function(localNotebookId) {
			note.NotebookId = localNotebookId;
			Notes.insert(note, function (err, newDoc) {   // Callback is optional
				if(err) {
					console.log(err);
					callback && callback(false);
				} else {
					// console.log("?????????")
					// console.log(note);
					// console.log(note.CreatedTime);
					callback && callback(newDoc);

					// 重新统计
					Notebook.reCountNotebookNumberNotes(note.NotebookId);

					// 下载内容, 图片, 附件
					me.syncContentAndImagesAndAttachs(newDoc, 2000);
				}
			});
		});
	},

	// sync <- 时
	// 更新笔记, 合并之, 内容要重新获取
	// note是服务器传过来的, 需要处理下fix
	// note.NoteId是服务器的
	// needReloadContent 内容是否需要重新加载, 如果处理冲突没有冲突, 已有内容, 不用更新, 只是把其它的覆盖
	updateNoteForce: function(note, callback, needReloadContent) {
		var me = this;

		if(needReloadContent === undefined) {
			needReloadContent = true;
		}

		note.IsDirty = false;
		note.InitSync = needReloadContent;
		note.LocalIsNew = false;
		note.LocalIsDelete = false;
		note.ContentIsDirty = false;

		// 附件处理
		// TODO IOS
		var files = note.Files || [];
		var attachsMap = {};
		for(var i = 0; i < files.length; ++i) {
			var file = files[i];
			if(file.IsAttach) { // LocalFileId, FileId
				// 对于服务器上的, 只有FileId会传过来, 此时要与之前的做对比
				file.ServerFileId = file.FileId;
				delete file['FileId'];
				attachsMap[file.ServerFileId] = file;
			}
		}

		// 之前也是有attachs的, 得到之前的attachs, 进行个merge
		// TODO, 这里, 如果serverNoteId有两个一样的, 就有问题了, 待重现
		me.getNoteByServerNoteId(note.NoteId, function(everNote) {
			if(!everNote) {
				return;
			}
			var everAttachs = everNote.Attachs;
			var everAttachsMap = {};

			// var needAdds = [];

			// 得到要删除的
			var needDeletes = [];
			for(var i = 0; i < everAttachs.length; ++i) {
				var everAttach = everAttachs[i];
				everAttachsMap[everAttach.ServerFileId] = everAttach;
				if(!attachsMap[everAttach.ServerFileId]) {
					needDeletes.push(everAttach);
				}
			}
			// console.log('everAttachs');
			// console.log(everAttachs);
			// console.log('attachsMap')
			// console.log(attachsMap);
			// 通过FileId删除文件
			me.deleteAttachs(needDeletes);

			// 得到要添加的,所有的
			// 新添加的没有Path
			var allAttachs = [];
			for(var serverFileId in attachsMap) {
				if(!everAttachsMap[serverFileId]) {
					// needAdds.push(attachMap[serverFileId]);
					attachsMap[serverFileId].FileId = serverFileId; // 生成一个Id(一样的), 但是没有Path
					allAttachs.push(attachsMap[serverFileId]);
				} else {
					allAttachs.push(everAttachsMap[serverFileId]);
				}
			}
			note.Attachs = allAttachs;

			note.ServerNoteId = note.NoteId;
			note.NoteId = everNote.NoteId;
			delete note['Files'];
			// console.log('evernote');
			// console.log(everNote);

			// 得到本地笔记本Id
			Notebook.getNotebookIdByServerNotebookId(note.NotebookId, function(localNotebookId) {
				note['NotebookId'] = localNotebookId;

				console.log("updateNoteForce 后的")
				// console.log(note);
				// console.log(note.ServerNoteId + " " + note.IsDirty);
				
				console.log('ever note');
				// console.log(everNote.NoteId);
				// console.log(everNote);

				// 不要服务器上的
				delete note['UpdatedTime'];
				delete note['CreatedTime'];

				Notes.update({NoteId: note.NoteId}, note, {}, function (err, cnt) { // Callback is optional
					console.log('re:');
					console.log(err);
					console.log(cnt);
					if(err) {
						console.error(err);
						callback && callback(false);
					} else {
						console.log('强制更新...');
						callback && callback(note);

						/*
						me.getNoteByServerNoteId(note.ServerNoteId, function(t) {
							console.log('强制更新后的...');
							console.log(t);
						});
						*/

						// 重新统计之
						Notebook.reCountNotebookNumberNotes(note.NotebookId);

						// 下载内容, 图片, 附件
						me.syncContentAndImagesAndAttachs(note);
					}
				});
			});
		});
	},

	// addNote, updateNote后的操作
	// 添加修改ServerNoteId; 更新修改usn
	// note是服务器传来的, note.NoteId, note.ServerNoteId已设置正确, note.NotebookId是服务器上的
	updateNoteForceForSendChange: function(note, isAdd, callback) {
		var me = this;
		note.IsDirty = false;
		note.InitSync = false;
		note.LocalIsNew = false;
		note.ContentIsDirty = false;
		// note.LocalIsDelete = false;
		// note.UserId = User.getCurActiveUserId();
		// 
		console.log("updateNoteForceForSendChange");
		console.log(note);

		// 如果是添加的, 因为不会传内容
		// if(isAdd) {
		delete note['Content'];
		// }

		delete note['NotebookId']; // 不要设置notebookId, 2/16 fixed

		console.log('server data from::::');
		console.log(note.NoteId);
		console.log(note.Files);

		// 修改Imags的LocalFileId <=> FileId的映射
		File.updateImageForce(note.Files);

		// 修改attach, 建立LocalFileId <=> FileId的映射
		var files = note.Files || [];
		var filesMap = {}; // LocalFileId => ServerFileId
		for(var i in files) {
			var file = files[i];
			if(file.IsAttach) { // LocalFileId, FileId
				filesMap[file.LocalFileId] = file.FileId;
			}
		}
		// 之前也是有attachs的, 得到之前的attachs, 进行个merge
		me.getNote(note.NoteId, function(everNote) {
			if(!everNote) {
				console.log('我靠, 没有?' + note.NoteId);
				return;
			}
			var everAttachs = everNote.Attachs || [];
			for(var i in everAttachs) {
				var everAttach = everAttachs[i];
				if(filesMap[everAttach.FileId]) {
					everAttach.ServerFileId = filesMap[everAttach.FileId];
					everAttach.IsDirty = false; // 不为dirty了, 记得在sync后也改为false
				}
			}
			note.Attachs = everAttachs;
			console.log('fix after');
			console.log(everAttachs);

			delete note['Files'];
			delete note['UpdatedTime'];
			delete note['CreatedTime'];

			Notes.update({NoteId: note.NoteId}, note, function(err, n) {
				if(err || !n) {
					log('updateNoteForceForSendChange err');
					log(err);
					return callback && callback(false);
				}
				return callback && callback(true);
			});

		});
	},

	// 服务器上的数据
	// 为冲突更新, note已有有NoteId, ServerNoteId, 但NotebookId是服务器端的
	updateNoteForceForConflict: function(note, callback) {
		var me = this;
		note.NoteId = note.ServerNoteId;
		me.updateNoteForce(note, callback);
		return;

		note.IsDirty = false;
		note.InitSync = true;
		note.LocalIsNew = false;
		note.LocalIsDelete = false;
		// 文件操作

		Notebook.getNotebookIdByServerNotebookId(note.NotebookId, function(localNotebookId) {
			note['NotebookId'] = localNotebookId;
			Notes.update({NoteId: note.NoteId}, note, {}, function (err, cnt) {   // Callback is optional
				if(err) {
					console.log(err);
					callback && callback(false);
				} else {
					log('强制更新...');
					callback && callback(note);
				}
			});
		});
	},

	// 将本地冲突的笔记复制一份
	// serverNoteId
	// 附件也要复制一份
	copyNoteForConfict: function(noteId, callback) {
		var me = this;
		me.getNote(noteId, function(note) { 
			if(!note) {
				callback(false);
				return;
			}
			// 新Id
			delete note['_id'];
			delete note['ServerNoteId'];
			note.NoteId = Common.objectId(); // 新生成一个NoteId
			note.ConflictNoteId = noteId; // 与noteId有冲突
			note.ConflictTime = new Date(); // 发生冲突时间
			note.ConflictFixed = false; // 冲突未解决
			note.IsDirty = true;
			note.LocalIsNew = true; // 新增加的
			note.InitSync = false; // 都是本地的, 相当于新建的笔记
			note.LocalIsDelete = false;

			// 只复制有path的
			var attachs = note.Attachs || [];
			var newAttachs = [];
			console.log('不会吧.............')
			console.log(attachs);
			async.eachSeries(attachs, function(attach, cb) {
				if(!attach.Path) {
					return cb();
				}
				// 新路径
				var filePathAttr = Common.splitFile(attach.Path);
				filePathAttr.nameNotExt += '_cp_' + attach.FileId; // 另一个
				var newPath = filePathAttr.getFullPath();
				console.log('复制文件');
				console.log(attach);
				// 复制之
				// try {
					Common.copyFile(attach.Path, newPath, function(ret) {
						if(ret) {
							attach.FileId = Common.objectId();
							attach.IsDirty = true;
							attach.Path = newPath;
							delete attach['ServerFileId'];
							newAttachs.push(attach);
						}
						cb();
					});
					/*
				} catch(e) {
					cb();
				}
				*/
			}, function() {
				note.Attachs = newAttachs;
				console.log('conflict 复制后的');
				console.log(note);
				Notes.insert(note, function(err, newNote) {
					if(err) {
						callback(false);

					} else {
						callback(newNote);
						// 重新统计笔记本的笔记数量
						Notebook.reCountNotebookNumberNotes(newNote.NotebookId);
					}
				});
			});
		});
	},

	// 复制笔记到某笔记本下, 本地使用
	copyNote: function(noteId, notebookId, callback) {
		var me = this;
		me.getNote(noteId, function(note) { 
			if(!note) {
				callback(false);
				return;
			}
			// 新Id
			delete note['_id'];
			delete note['ServerNoteId'];
			note.NoteId = Common.objectId();
			note.IsDirty = true;
			note.LocalIsNew = true; // 新增加的
			note.InitSync = false; // 都是本地的, 相当于新建的笔记
			note.LocalIsDelete = false;
			note.IsTrash = false;
			note.NotebookId = notebookId;

			// 只复制有path的
			var attachs = note.Attachs || [];
			var newAttachs = [];
			async.eachSeries(attachs, function(attach, cb) {
				if(!attach.Path) {
					return cb();
				}
				// 新路径
				var filePathAttr = Common.splitFile(attach.Path);
				filePathAttr.nameNotExt += '_cp_' + attach.FileId; // 另一个
				var newPath = filePathAttr.getFullPath();
				// 复制之
				// try {
					Common.copyFile(attach.Path, newPath, function(ret) {
						if(ret) {
							attach.FileId = Common.objectId();
							attach.IsDirty = true;
							attach.Path = newPath;
							delete attach['ServerFileId'];
							newAttachs.push(attach);
						}
						cb();
					});
					/*
				} catch(e) {
					cb();
				}
				*/
			}, function() {
				note.Attachs = newAttachs;
				console.log('conflict 复制后的');
				console.log(note.Attachs);
				Notes.insert(note, function(err, newNote) {
					if(err) {
						callback(false);
					} else {
						callback(newNote);
						// 重新统计下
						Notebook.reCountNotebookNumberNotes(newNote.NotebookId);
					}
				});
			});
		});
	},

	// 处理冲突
	// notes是服务器的数据, 与本地的有冲突
	// 1) 将本地的note复制一份
	// 2) 服务器替换之前
	fixConflicts: function(noteSyncInfo, callback) {
		var me = this;

		var conflictNotes = noteSyncInfo.conflicts;
		console.log('fix note conflicts');
		console.log(conflictNotes);
		// 这里为什么要同步? 因为fixConflicts后要进行send changes, 这些有冲突的不能发送changes
		conflictNotes || (conflictNotes = []);
		if(!Api) {
			Api = require('./api')
		}
		async.eachSeries(conflictNotes, function(serverAndLocalNote, cb) {
			// var noteId = note.NoteId; // 本地noteId
			// 复制一份, 本地的复制一份, 然后服务器上的替换本地的
			// newNote其实是现有的复制一份得到的

			// TODO, 这里, 如果内容是一样的, 则以服务器上的版为准

			console.error('是否真的冲突');
			var serverNote = serverAndLocalNote.server; // noteId没有转换的
			var localNote = serverAndLocalNote.local; // 本地的note

			Api.getNoteContent(serverNote.NoteId, function(noteContent) {
				// 同步到本地
				if(Common.isOk(noteContent)) {
					var serverContent = me.fixNoteContent(noteContent.Content); // 图片, 附件的链接
					// var serverContent = noteContent.Content; // 图片, 附件的链接

					// console.error(serverContent);
					// console.error(localNote.Content);

					// 没有冲突, 好, 用服务器端的其它值
					if(serverContent == localNote.Content) { 
						console.error(localNote.Title + ' 无冲突');
						// console.log(serverNote);
						delete serverNote['Content'];
						delete serverNote['Abstract'];
						delete serverNote['Desc'];
						me.updateNoteForce(serverNote, function(updatedNote) {
							// 作为更新
							noteSyncInfo.updates.push(updatedNote);
							cb();
						}, false);
					}

					// 不行, 冲突了, 复制一份
					// TODO 用新的Content, 不要再去取了
					else {
						me.copyNoteForConfict(localNote.NoteId, function(newNote) {
							if(newNote) {
								// 更新之前的
								serverNote.ServerNoteId = serverNote.NoteId;
								serverNote.NoteId = localNote.NoteId;
								me.updateNoteForceForConflict(serverNote, function(note2) { 
									if(note2) {
										// 前端来处理, 全量sync时不用前端一个个处理
										Web.fixSyncConflictNote(note2, newNote);
									}
									cb();
								});
							} else {
								cb();
							}
						});
					}
				}
			});
			
		}, function() {
			// 最后调用
			callback && callback();

			// 因为在处理冲突的时候有些成为更新了, 所以必须在此之后调用
			console.log('has updates...');
			console.log(noteSyncInfo.updates);
			// 处理更新的
			Web.updateSyncNote(noteSyncInfo.updates);
		});

		// 发送改变的冲突
		// 复制一份
		// 发送改变的冲突, 有这种情况发生吗?
		var changeConflicts = noteSyncInfo.changeConflicts;
		console.log('changeConflicts');
		console.log(changeConflicts);
		for(var i = 0; i < changeConflicts.length; ++i) {
			(function(i) {

				var note = changeConflicts[i]; // note是本地的note
				// 复制一份
				me.copyNoteForConfict(note.NoteId, function(newNote) {
					if(newNote) {
						// 更新之前的, 要先从服务器上得到服务版的
						// 这里的note是本地的, 所以将服务器上的覆盖它
						if(!Api) {
							Api = require('./api');
						}
						Api.getNote(note.ServerNoteId, function(serverNote) {
							serverNote.ServerNoteId = serverNote.NoteId;
							serverNote.NoteId = note.NoteId;
							console.error("changeConflicts -> get note from server");
							console.log(serverNote);
							console.log(note);
							me.updateNoteForceForConflict(serverNote, function(note2) { 
								if(!note2) {
									// 前端来处理, 全量sync时不用前端一个个处理
									Web.fixSyncConflict(note2, newNote);
								}
							});
						});
					} else {
					}
				});

			})(i);
		}

		// 服务器没有, 但是是发送更新的, 所以需要作为添加以后再send changes
		if(noteSyncInfo.changeNeedAdds) { 
			var needAddNotes = noteSyncInfo.changeNeedAdds;
			for(var i = 0; i < needAddNotes.length; ++i) {
				console.log('need add ');
				var note = needAddNotes[i];
				me.setIsNew(note.NoteId);
			}
		}

		// 处理添加的
		var addNotes = noteSyncInfo.adds;
		console.log('has add...');
		console.log(addNotes);
		Web.addSyncNote(addNotes);

		// 处理删除的
		Web.deleteSyncNote(noteSyncInfo.deletes);

		// 为了博客
		var changeAdds = noteSyncInfo.changeAdds || [];
		var changeUpdates = noteSyncInfo.changeUpdates || [];
		changeAdds = changeAdds.concat(changeUpdates);
		Web.updateNoteCacheForServer(changeAdds);

	},

	// 得到所有文件要传的基本信息和传送的数据
	getFilesPostInfo: function(files, callback) {
		var needPostFilesAttr = [];
		var needTransferFiles = {};
		if(!files || files.length == 0) {
			return callback(needPostFilesAttr, needTransferFiles);
		}

		async.eachSeries(files, function(file, cb) {
			// var file = files[i];
			var needFile = {
				FileId: file.ServerFileId,
				LocalFileId: file.FileId,
				Type: file.Type,
				HasBody: false,
				IsAttach: file.IsAttach,
			};

			// console.log(file);
			// 要传数据的
			if(file.IsDirty) {
				// TODO
				if(file.Path.indexOf('data/') == 0) {
					file.Path = Evt.getAbsolutePath(file.Path);
				}
				fs.exists(file.Path, function(isExists) {
					if(isExists) {
						needTransferFiles[file.FileId] = {
							file: file.Path,
							content_type: 'application/' + file.Type // TODO
						}
						if(file.Title) {
							needTransferFiles[file.FileId].filename = file.Title;
						}
						needFile.HasBody = true;
						needPostFilesAttr.push(needFile);
					}
					return cb();
				});
			} else {
				needPostFilesAttr.push(needFile);
				return cb();
			}
		}, function() {
			callback(needPostFilesAttr, needTransferFiles);
		});
	},

	// 获得用户修改的笔记
	getDirtyNotes: function(callback) {
		var me = this;
		Notes.find({UserId: User.getCurActiveUserId(), IsDirty: true}, function(err, notes) {
			if(err) {
				log(err);
				return callback && callback(false);
			} else {
				// 每一个笔记得到图片, 附件信息和数据
				async.eachSeries(notes, function(note, cb) {
					me.getNoteFiles(note, function(files) {
						note.Content = me.fixNoteContentForSend(note.Content);
						// note.Files = files || [];
						me.getFilesPostInfo(files, function(attrs, fileDatas) { 
							note.Files = attrs;
							note.FileDatas = fileDatas;
							cb();
						});
					});
				}, function() {
					callback(notes);
				});
			}
		});
	},

	// 得到笔记的文件
	getNoteFiles: function(note, callback) {
		var noteId = note.NoteId;
		var content = note.Content;

		// 1. 先得到附件
		var attachs = note.Attachs || [];
		for(var i in attachs) {
			var attach = attachs[i];
			attach.IsAttach = true;
		}

		// 1. 先得到图片

		// 得到图片信息, 通过内容
		// http://localhost:8002/api/file/getImage?fileId=xxxxxx, 得到fileId, 查询数据库, 得到图片
		// console.log(content);
		// console.log(Evt.localUrl + '/api/file/getImage?fileId=([0-9a-zA-Z]{24})');
		var reg = new RegExp(Evt.localUrl + "/api/file/getImage\\?fileId=([0-9a-zA-Z]{24})", 'g');
		var fileIds = [];
		// var fileIdsMap = {}; // 防止多个
		while((result = reg.exec(content)) != null) {
			// result = [所有, 子表达式1, 子表达式2]
			if(result && result.length > 1) {
	            // console.log(result);
				var fileId = result[1];
				fileIds.push(fileId);
			}
        }
        var files = []; // {localFileId: "must", fileId: "", hasBody: true, filename: "xx.png"}
        if(fileIds.length > 0) {
        	// 得到所有的图片
        	File.getAllImages(fileIds, function(images) {
        		// attach与图片结合
        		if(images) {
        			attachs = attachs.concat(images);
        		}
        		callback(attachs);
        	});
        } else {
        	callback(attachs);
        }
	},

	// 在send delete笔记时成功
	setNotDirty: function(noteId) {
		Notes.update({NoteId: noteId}, {IsDirty: false})
	},
	removeNote: function(noteId) {
		Notes.remove({NoteId: noteId});
	},
	// 在send delete笔记时有冲突, 设为不删除
	setNotDirtyNotDelete: function(noteId) {
		Notes.update({NoteId: noteId}, {IsDirty: false, LocalIsDelete: false})
	},
	setIsNew: function(noteId) {
		Notes.update({NoteId: noteId}, {LocalIsNew: true, IsDirty: true})
	},

	//----------------------------------
	// Attach
	// 有部分操作放在File中了, 
	// 也有attach表, 但只作添加/删除附件用
	// 

	// 更新笔记的附件
	// web只要一个添加了, 删除的, 全部更新
	updateAttach: function(noteId, attachs) {
		var me = this;
		console.log('updateAttach');
		console.log(attachs);

		// 删除修改了的
		me.deleteNotExistsAttach(noteId, attachs, function() {
			// 一个坑!!!!!!!!!!!, js是引用的, needb并不会立即写到硬盘上, 在内存中是一个引用
			var t = [];
			for(var i in attachs) {
				t.push(attachs[i]);
			}
			Notes.update({NoteId: noteId}, {Attachs: t, IsDirty: true, UpdatedTime: new Date()} );
		});
	},

	// web端操作, 删除attach时, 删除不要的attach
	deleteNotExistsAttach: function(noteId, attachs, callback) {
		var me = this;
		// console.log('--');
		me.getNote(noteId, function(note) {
			if(!note) {
				callback();
				return;
			}
			var everAttachs = note.Attachs || [];
			var nowMap = {};
			for(var i in attachs) {
				nowMap[attachs[i].FileId] = attachs[i];
			}
			// console.log(note);
			// console.log('end');
			// console.log(everAttachs.length);
			// console.log(attachs.length);
			// console.log(attachs == everAttachs);
			var fileBasePath = User.getCurUserAttachsPath();
			for(var i in everAttachs) {
				var attach = everAttachs[i];
				var path = attach.Path;
				if(!nowMap[attach.FileId]) { // 如果不在, 则删除之
					// console.log(">>>>>>>>>");
					try {
						// 删除源文件, 别删错了啊
						if(path.indexOf(fileBasePath) >= 0) {
							fs.unlink(path);
						}
					} catch(e) {
						console.log(e);
					}
				}
			}

			// 一个坑!!!!!!!!!!!
			callback();
		});
	},

	// 删除附件, 在sync时
	deleteAttachs: function(attachs) {
		var me = this;
		var fileBasePath = User.getCurUserAttachsPath();
		if(!attachs) {
			return;
		}
		for(var i in attachs) {
			if(!attachs[i]) {
				continue;
			}
			var path = attachs[i].Path;
			if(path && path.indexOf(fileBasePath) > 0) {
				try {
					fs.unlink(path);
				} catch(e) {
					console.log(e);
				}
			}
		}
	},

	// 同步内容, 图片, 附件
	// 异步操作
	// 延迟1s
	syncContentAndImagesAndAttachs: function(note, timeout) {
		var me = this;
		// return;
		setTimeout(function() {
			// 内容
			// console.log("syncContentAndImagesAndAttachs..................." + note.NoteId);
			me.getNoteContent(note.NoteId, function(noteAndContent) { 
				if(noteAndContent) {
					console.log('sync content ' + note.NoteId + ' ok');
					var content = noteAndContent.Content;
					// Web.contentSynced(note.NoteId, note.Content);
					// 图片
					if(content) {
						me.syncImages(content);
					}
				} else {
					// Web.alertWeb(note.NoteId + ' ' + note.Title  + ' getContent error!!');
				}
			});

			// TODO IOS
			return;
			// 附件
			var attachs = note.Attachs || [];
			for(var i = 0; i < attachs.length; ++i) {
				var attach = attachs[i];
				me.downloadAttachFromServer(note.NoteId, attach.ServerFileId, attach.FileId);
			}
		}, timeout || 1000);
	},

	// 同步图片
	// TODO IOS
	inSyncImage: {}, // 
	syncImages: function(content) {

		// 暂时不处理
		return;

		var me = this;
		if(!content) {
			return;
		}
		console.log('syncImages..................');
		// console.log(content);
		// 得到图片id
		var reg = new RegExp(Evt.localUrl + "/api/file/getImage\\?fileId=(.{24})\"", 'g');
		// var a = 'abdfileId="xxx" alksdjfasdffileId="life"';
		// var reg = /fileId="(.+?)"/g;
		var s;
		// console.log(reg);
		while(s = reg.exec(content)) {
			// console.log(s);
			if(s && s.length >= 2) {
				var fileId = s[1];
				console.log('sync image: ' + fileId);
				if(!me.inSyncImage[fileId]) {
					me.inSyncImage[fileId] = true;
					File.getImage(fileId, function() {
						me.inSyncImage[fileId] = false;
					});
				}
			}
		}
	},

	/*
	1) sync时判断是否有attach, 如果有, 则异步下载之
	2) 前端render note时, 判断是否有未Path的attach, 调用该服务
	从服务器端下载文件, 并通过到前端已下载完成
	*/
	inDownload: {}, // 正在下载的文件 fileId => true
	downloaded: {}, // 下载完成的
	downloadAttachFromServer: function(noteId, serverFileId, fileId) {
		var me = this;
		console.log('下载中: ' + serverFileId);
		if(me.inDownload[serverFileId] || me.downloaded[serverFileId]) {
			// return;
		}
		if(!Api) {
			Api = require('./api');
		}

		me.inDownload[serverFileId] = true;
		Api.getAttach(serverFileId, function(ok, toPath, filename) { 
			me.inDownload[serverFileId] = false;
			if(ok) {
				me.downloaded[serverFileId] = fileId;
				// 更新serverFileId与fileId的映射, 修改的是note
				me.syncAttach(noteId, serverFileId, fileId, toPath, filename, function(ok, attachs, attach) {
					if(ok) {
						// 通知web
						Web.attachSynced(attachs, attach, noteId);
					}
				});
			} else {
				// 下次再下载 ?
				// 或者放到一个队列中 ?
				// TODO
			}
		});
	},

	// 同步附件, 更新serverFileId
	syncAttach: function(noteId, serverFileId, fileId, path, filename, callback) {
		var me = this;
		me.getNote(noteId, function(note) {
			if(!note) {
				callback(false);
			}
			var attachs = note.Attachs;
			for(var i = 0; i < attachs.length; ++i) {
				var attach = attachs[i];
				if(attach.FileId == fileId) {
					attach.ServerFileId = serverFileId;
					attach.Path = path;
					// attach.Title = filename;
					// attach.Filename = filename;

					Notes.update({_id: note._id}, {Attachs: attachs}, function() {
						callback(true, attachs, attach);
					});
					break;
				}
			}
			callback(false);
		});
	},

	// 根据标签得到笔记数量
	countNoteByTag: function(title, callback) {
		var userId = User.getCurActiveUserId();
		Notes.count({UserId: userId, LocalIsDelete: false , Tags: {$in: [title]}}, function(err, cnt) {
			callback && callback(cnt);
		});
	},
	// 彻底删除笔记时调用
	updateTagCount: function(tags) {
		var me = this;
		if(!tags) {
			return;
		}
		var tagUpdate = {}; // 
		if(!Tag) {
			Tag = require('./tag');
		}

		var userId = User.getCurActiveUserId();
		for(var i in tags) {
			var title = tags[i];
			(function(t) {
				me.countNoteByTag(t, function(cnt) {
					Tag.updateTagCount(t, cnt);
				});
			})(title);
		}
	},
	// 删除包含title的笔记
	updateNoteToDeleteTag: function(title, callback) {
		var updates = {}; // noteId => 
		var userId = User.getCurActiveUserId();
		console.log('updateNoteToDeleteTag--');
		Notes.find({UserId: userId, LocalIsDelete: false , Tags: {$in: [title]}}, function(err, notes) {
			console.log(notes);
			if(!err && notes && notes.length > 0) {
				for(var i in notes) {
					var note = notes[i];
					var tags = note.Tags;
					// 删除之
					for(var j in tags) {
						if(tags[j] == title) {
							tags = tags.splice(j, 1);
							break;
						}
					}
					note.Tags = tags;
					note.IsDirty = true;
					updates[note.NoteId] = note;
					Notes.update({_id: note._id}, {Tags: tags, IsDirty: true}, function(err) {
						console.log("??");
						console.log(err);
						callback(updates);
					});
				}
			} else {
				console.log('updateNoteToDeleteTag');
				console.log(err);
				callback({});
			}
		});
	}
};

module.exports = Note;