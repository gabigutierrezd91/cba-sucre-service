const { admin, db } = require('../util/admin');

const config = require('../util/config');

const firebase = require('firebase');

exports.getAllPosts = (request, response) => {
  db.collection('posts')
    .orderBy('createdAt', 'desc')
    .get()
    .then((data) => {
      let posts = [];
      data.forEach((doc) => {
        posts.push({
          postId: doc.id,
          title: doc.data().title,
          body: doc.data().body,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt,
          commentCount: doc.data().commentCount,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage
        });
      });
      return response.json(posts);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err.code });
    });
};

exports.postOnePost = (request, response) => {
  if (request.body.title.trim() === '') {
    return response.status(400).json({ title: 'Title must not be empty' });
  }

  if (request.body.body.trim() === '') {
    return response.status(400).json({ body: 'Body must not be empty' });
  }

  const newPost = {
    title: request.body.title,
    body: request.body.body,
    userHandle: request.user.handle,
    userImage: request.user.imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
    filesList: []
  };

  db.collection('posts')
    .add(newPost)
    .then((doc) => {
      const resPost = newPost;
      resPost.postId = doc.id;
      response.json(resPost);
    })
    .catch((err) => {
      response.status(500).json({ error: 'something went wrong' });
      console.error(err);
    });
};
// Fetch one post
exports.getPost = (request, response) => {
  let postData = {};
  db.doc(`/posts/${request.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: 'Post not found' });
      }
      postData = doc.data();
      postData.postId = doc.id;
      return db
        .collection('comments')
        .orderBy('createdAt', 'desc')
        .where('postId', '==', request.params.postId)
        .get();
    })
    .then((data) => {
      postData.comments = [];
      data.forEach((doc) => {
        postData.comments.push(doc.data());
      });
      return response.json(postData);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err.code });
    });
};

exports.editPost = (request, response) => {
  if (request.body.title.trim() === '') {
    return response.status(400).json({ title: 'Title must not be empty' });
  }

  if (request.body.body.trim() === '') {
    return response.status(400).json({ body: 'Body must not be empty' });
  }

  const editedPost = {
    title: request.body.title,
    body: request.body.body
  };

  const postDocument = db.doc(`/posts/${request.params.postId}`);

  postDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        return postDocument.update(editedPost);
      } else {
        return response.status(404).json({ error: 'Post not found' });
      }
    })
    .then(() => {
      return response.json({ message: 'Post edited successfully' });
    })
    .catch((err) => {
      console.error(err);
      return response.status(500).json({ error: err.code });
    });
};

// File on a post
exports.fileOnPost = (request, response) => {
  const BusBoy = require('busboy');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');

  const busboy = new BusBoy({ headers: request.headers });

  let fileToBeUploaded = {};

  let fileInfo = {};

  const postDocument = db.doc(`/posts/${request.params.postId}`);

  let filesData;
  let datafileName;

  postDocument
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: 'Post not found' });
      }
      busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        console.log(fieldname, file, filename, encoding, mimetype);
        if (mimetype === 'application/vnd.microsoft.portable-executable') {
          return response.status(400).json({ error: 'Wrong file type submitted' });
        }
        datafileName = filename;
        const fileExtension = filename.split('.')[filename.split('.').length - 1];
        while(doc.data().filesList.find(a => a === datafileName) !== undefined) {
          datafileName = datafileName.slice(0, datafileName.length - fileExtension.length - 1);
          datafileName = datafileName.concat('_copy.', fileExtension);
        }
        const filepath = path.join(os.tmpdir(), datafileName);
        fileToBeUploaded = { filepath, mimetype, datafileName };
        file.pipe(fs.createWriteStream(filepath));
      });
      
      busboy.on('finish', () => {
        admin
          .storage()
          .bucket()
          .upload(fileToBeUploaded.filepath, {
            destination: `${request.params.postId}/${fileToBeUploaded.datafileName}`,
            // Files larger than 5 Mb:
            // resumable: true,
            metadata: {
              metadata: {
                contentType: fileToBeUploaded.mimetype
              }
            }
          })
          .then(() => {
            return response.json({ message: 'file uploaded successfully' });
          })
          .catch((err) => {
            console.error(err);
            return response.status(500).json({ error: 'something went wrong' });
          });
      });
      busboy.end(request.rawBody);
      filesData = doc.data().filesList;
      filesData.push(fileToBeUploaded.datafileName);
      return postDocument.update({ filesList: filesData});
    })
    .then(() => {
      fileInfo = {
        fileName: fileToBeUploaded.datafileName,
        fileUrl: `https://firebasestorage.googleapis.com/v0/b/${
              config.storageBucket
            }/o/${request.params.postId}%2F${fileToBeUploaded.datafileName}?alt=media`,
        userHandle: request.user.handle,
        createdAt: new Date().toISOString(),
        postId: request.params.postId
      };
      return db.collection('files').add(fileInfo);
    })
    .then((doc) => {
      const resFile = fileInfo;
      resFile.fileId = doc.id;
      response.json(resFile);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: 'Something went wrong' });
    });
}

// Delete a file
exports.deleteFile = (request, response) => {

  const file = db.doc(`/files/${request.params.fileId}`);
  file
    .get()
    .then((doc) => {
      if(!doc.exists) {
        return response.status(404).json({ error: 'File not found'});
      }
      if(doc.data().userHandle !== request.user.handle) {
        return response.status(403).json({ error: 'Unauthorized' });
      } else {
        admin
          .storage()
          .bucket()
          .file(`${doc.data().postId}/${doc.data().fileName}`)
          .delete();

        db.doc(`/posts/${doc.data().postId}`)
          .get()
          .then((dataPost) => {
            if (!dataPost.exists) {
              return response.status(404).json({ error: 'Post not found' });
            }
            let newFilesList = dataPost.data().filesList;
            newFilesList.splice(newFilesList.findIndex(a => a === doc.data().fileName), 1);
            return dataPost.ref.update({ filesList: newFilesList });
          })
          .then(() => {
            return response.json({ message: 'Files List Updated' });
          })
          .catch((err) => {
            console.error(err);
            return response.status(500).json({ error: err.code });
          });

        return file.delete();
      }
    })
    .then(() => {
      response.json({ message: 'File deleted successfully' });
    })
    .catch((err) => {
      console.error(err);
      return response.status(500).json({ error: err.code });
    });
};

// Comment on a post
exports.commentOnPost = (request, response) => {
  if (request.body.body.trim() === '')
    return response.status(400).json({ comment: 'Must not be empty' });

  const newComment = {
    body: request.body.body,
    createdAt: new Date().toISOString(),
    postId: request.params.postId,
    userHandle: request.user.handle,
    userImage: request.user.imageUrl
  };
  console.log(newComment);

  db.doc(`/posts/${request.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: 'Post not found' });
      }
      return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
    })
    .then(() => {
      return db.collection('comments').add(newComment);
    })
    .then(() => {
      response.json(newComment);
    })
    .catch((err) => {
      console.log(err);
      response.status(500).json({ error: 'Something went wrong' });
    });
};
// Like a post
exports.likePost = (request, response) => {
  const likeDocument = db
    .collection('likes')
    .where('userHandle', '==', request.user.handle)
    .where('postId', '==', request.params.postId)
    .limit(1);

  const postDocument = db.doc(`/posts/${request.params.postId}`);

  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        postData = doc.data();
        postData.postId = doc.id;
        return likeDocument.get();
      } else {
        return response.status(404).json({ error: 'Post not found' });
      }
    })
    .then((data) => {
      if (data.empty) {
        return db
          .collection('likes')
          .add({
            postId: request.params.postId,
            userHandle: request.user.handle
          })
          .then(() => {
            postData.likeCount++;
            return postDocument.update({ likeCount: postData.likeCount });
          })
          .then(() => {
            return response.json(postData);
          });
      } else {
        return response.status(400).json({ error: 'Post already liked' });
      }
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err.code });
    });
};

exports.unlikePost = (request, response) => {
  const likeDocument = db
    .collection('likes')
    .where('userHandle', '==', request.user.handle)
    .where('postId', '==', request.params.postId)
    .limit(1);

  const postDocument = db.doc(`/posts/${request.params.postId}`);

  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        postData = doc.data();
        postData.postId = doc.id;
        return likeDocument.get();
      } else {
        return response.status(404).json({ error: 'Post not found' });
      }
    })
    .then((data) => {
      if (data.empty) {
        return response.status(400).json({ error: 'Post not liked' });
      } else {
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            postData.likeCount--;
            return postDocument.update({ likeCount: postData.likeCount });
          })
          .then(() => {
            response.json(postData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err.code });
    });
};
// Delete a post
exports.deletePost = (request, response) => {
  const document = db.doc(`/posts/${request.params.postId}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: 'Post not found' });
      }
      if (doc.data().userHandle !== request.user.handle) {
        return response.status(403).json({ error: 'Unauthorized' });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      response.json({ message: 'Post deleted successfully' });
    })
    .catch((err) => {
      console.error(err);
      return response.status(500).json({ error: err.code });
    });
};
