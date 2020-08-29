const { db } = require('../util/admin');

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
    commentCount: 0
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
        if (doc.data().title === editedPost.title && 
            doc.data().body === editedPost.body) {
          return response.json({ message: 'There are no changes' });
        } else {
          return postDocument.update(editedPost);
        }
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

// Comment on a comment
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
