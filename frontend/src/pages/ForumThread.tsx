import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createForumReply,
  fetchForumPostDetail,
  ForumPostSummary,
  ForumReplyNode,
  registerForumPostView,
  setForumPostReaction,
  updateForumPost,
} from "../api";
import { resolveAvatarUrl } from "../avatar";
import { useAppContext } from "../context/AppContext";
import { useNotifications } from "../context/NotificationContext";

const formatRelativeTime = (iso: string): string => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
};

const ForumThread = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { token } = useAppContext();
  const { notifyError, notifySuccess, notifyWarning } = useNotifications();

  const [post, setPost] = useState<ForumPostSummary | null>(null);
  const [replies, setReplies] = useState<ForumReplyNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | undefined>(undefined);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const allRepliesById = useMemo(() => {
    const map = new Map<string, ForumReplyNode>();
    const walk = (nodes: ForumReplyNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        if (node.children.length > 0) {
          walk(node.children);
        }
      }
    };

    walk(replies);
    return map;
  }, [replies]);

  useEffect(() => {
    if (!token || !postId) {
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const detail = await fetchForumPostDetail(token, postId);
        setPost(detail.post);
        setReplies(detail.replies);
        setEditTitle(detail.post.title);
        setEditContent(detail.post.content);

        try {
          const nextViewCount = await registerForumPostView(token, postId);
          setPost((current) => (current ? { ...current, viewCount: nextViewCount } : current));
        } catch {
          // View registration should not block thread reading.
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load post";
        notifyError(message, "Forum");
      } finally {
        setLoading(false);
      }
    })();
  }, [notifyError, postId, token]);

  const handleReaction = async (nextReaction: "like" | "dislike") => {
    if (!token || !postId || !post) {
      return;
    }

    try {
      const normalizedReaction = post.viewerReaction === nextReaction ? null : nextReaction;
      const result = await setForumPostReaction(token, postId, normalizedReaction);
      setPost((current) =>
        current
          ? {
            ...current,
            likeCount: result.likeCount,
            dislikeCount: result.dislikeCount,
            viewerReaction: result.viewerReaction,
          }
          : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update reaction";
      notifyError(message, "Forum");
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = replyContent.trim();

    if (!trimmed) {
      notifyWarning("Reply cannot be empty.", "Forum");
      return;
    }

    if (!token || !postId) {
      return;
    }

    setSubmittingReply(true);
    try {
      await createForumReply(token, postId, {
        content: trimmed,
        parentReplyId: replyParentId,
      });

      const detail = await fetchForumPostDetail(token, postId);
      setPost(detail.post);
      setReplies(detail.replies);
      setReplyContent("");
      setReplyParentId(undefined);
      notifySuccess("Reply posted.", "Forum");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit reply";
      notifyError(message, "Forum");
    } finally {
      setSubmittingReply(false);
    }
  };

  const savePostEdit = async (event: FormEvent) => {
    event.preventDefault();

    if (!token || !postId || !post) {
      return;
    }

    const title = editTitle.trim();
    const content = editContent.trim();

    if (title.length < 3 || title.length > 180) {
      notifyWarning("Title must be between 3 and 180 characters.", "Forum");
      return;
    }

    if (!content) {
      notifyWarning("Content cannot be empty.", "Forum");
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await updateForumPost(token, postId, {
        title,
        content,
      });
      setPost(updated);
      setEditingPost(false);
      notifySuccess("Post updated.", "Forum");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update post";
      notifyError(message, "Forum");
    } finally {
      setSavingEdit(false);
    }
  };

  const renderReplies = (nodes: ForumReplyNode[], depth = 0): ReactNode[] => {
    return nodes.flatMap((reply) => {
      const margin = `${Math.min(depth, 8) * 20}px`;
      const children = renderReplies(reply.children, depth + 1);

      return [
        <article key={reply.id} className="card ui-surface forum-reply-card" style={{ marginLeft: margin }}>
          <div className="forum-post-head">
            <img src={resolveAvatarUrl(reply.author.avatar, reply.author.username)} alt={reply.author.username} />
            <div>
              <p>
                <strong>{reply.author.username}</strong>
                <span className="muted"> | {formatRelativeTime(reply.createdAt)}</span>
              </p>
            </div>
          </div>
          <p>{reply.content}</p>
          <div className="forum-post-meta">
            <button
              type="button"
              onClick={() => {
                setReplyParentId(reply.id);
              }}
            >
              Reply
            </button>
          </div>
        </article>,
        ...children,
      ];
    });
  };

  if (!postId) {
    return (
      <section className="ui-section forum-page">
        <p className="muted">Post id is missing.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="ui-section forum-page">
        <p className="muted">Loading thread...</p>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="ui-section forum-page">
        <p className="muted">Thread not found.</p>
        <button type="button" onClick={() => navigate("/forum")}>
          Back to forum
        </button>
      </section>
    );
  }

  const replyingTo = replyParentId ? allRepliesById.get(replyParentId) : undefined;

  return (
    <section className="ui-section forum-page">
      <div className="page-title-row">
        <h1>Forum Thread</h1>
        <Link to="/forum">Back to forum</Link>
      </div>

      <article className="card ui-surface forum-post-card">
        <div className="forum-post-head">
          <img src={resolveAvatarUrl(post.author.avatar, post.author.username)} alt={post.author.username} />
          <div>
            <h2>{post.title}</h2>
            <p className="muted">
              {post.author.username} in {post.category.name} | {formatRelativeTime(post.createdAt)}
            </p>
          </div>
        </div>

        {editingPost ? (
          <form onSubmit={savePostEdit} className="forum-edit-form">
            <input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              maxLength={180}
              required
            />
            <textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              rows={6}
              maxLength={10_000}
              required
            />
            <div className="forum-post-meta">
              <button type="submit" disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingPost(false);
                  setEditTitle(post.title);
                  setEditContent(post.content);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p>{post.content}</p>
            <div className="forum-post-meta">
              <span>{post.replyCount} comments</span>
              <span>{post.viewCount} views</span>
              <button
                type="button"
                className={post.viewerReaction === "like" ? "forum-react-active" : ""}
                onClick={() => void handleReaction("like")}
              >
                Like ({post.likeCount})
              </button>
              <button
                type="button"
                className={post.viewerReaction === "dislike" ? "forum-react-active" : ""}
                onClick={() => void handleReaction("dislike")}
              >
                Dislike ({post.dislikeCount})
              </button>
              {post.isAuthor ? (
                <button type="button" onClick={() => setEditingPost(true)}>
                  Edit post
                </button>
              ) : null}
            </div>
          </>
        )}
      </article>

      <form className="card ui-surface forum-create-form" onSubmit={submitReply}>
        <h3>Write a comment</h3>
        {replyingTo ? (
          <p className="muted">
            Replying to {replyingTo.author.username}
            <button
              type="button"
              onClick={() => setReplyParentId(undefined)}
              className="forum-inline-button"
            >
              Clear
            </button>
          </p>
        ) : null}
        <textarea
          value={replyContent}
          onChange={(event) => setReplyContent(event.target.value)}
          placeholder="Write your comment. Emojis and special characters are supported."
          rows={4}
          maxLength={5_000}
          required
        />
        <div className="forum-form-footer">
          <span className="muted">{replyContent.length}/5000</span>
          <button type="submit" disabled={submittingReply}>
            {submittingReply ? "Posting..." : "Post comment"}
          </button>
        </div>
      </form>

      <div className="list-stack forum-reply-list">{renderReplies(replies)}</div>
    </section>
  );
};

export default ForumThread;
