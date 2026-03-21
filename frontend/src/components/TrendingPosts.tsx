import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api";
import { useAppContext } from "../context/AppContext";

type TrendingPost = {
  id: string;
  title: string;
  replyCount: number;
  createdAt: string;
  author: {
    username: string;
    avatar: string | null;
  };
};

const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const AvatarCircle = ({ username, avatar }: { username: string; avatar: string | null }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (avatar && !imgFailed) {
    return (
      <img
        className="trending-avatar"
        src={avatar}
        alt={username}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // Fallback: coloured circle with first letter
  const initial = username.charAt(0).toUpperCase();
  const hue = [...username].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="trending-avatar trending-avatar-fallback"
      style={{ backgroundColor: `hsl(${hue}, 55%, 35%)` }}
      aria-label={username}
    >
      {initial}
    </div>
  );
};

const TrendingPosts = () => {
  const { token } = useAppContext();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/home/trending-posts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as { posts: TrendingPost[] };
        setPosts(data.posts);
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [token]);

  return (
    <section className="home-section">
      <h2 className="home-section-title">Trending Discussions</h2>
      {loading ? (
        <div className="trending-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="trending-skeleton-row" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="muted">No forum posts yet. Be the first!</p>
      ) : (
        <ul className="trending-list">
          {posts.map((post) => (
            <li key={post.id} className="trending-row">
              <AvatarCircle username={post.author.username} avatar={post.author.avatar} />
              <div className="trending-info">
                <button
                  type="button"
                  className="trending-title-btn"
                  onClick={() => navigate("/forum")}
                >
                  {post.title}
                </button>
                <span className="muted trending-meta">
                  by {post.author.username} · {post.replyCount} repl{post.replyCount === 1 ? "y" : "ies"} · {formatRelativeTime(post.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default TrendingPosts;
