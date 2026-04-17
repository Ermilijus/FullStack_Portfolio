import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createForumPost,
  fetchForumCategories,
  fetchForumPosts,
  ForumCategory,
  ForumPostSummary,
  setForumPostReaction,
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

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const Forum = () => {
	const navigate = useNavigate();
	const { token } = useAppContext();
	const { notifyError, notifySuccess, notifyWarning } = useNotifications();

	const [categories, setCategories] = useState<ForumCategory[]>([]);
	const [posts, setPosts] = useState<ForumPostSummary[]>([]);
	const [searchInput, setSearchInput] = useState("");
	const [searchTerm, setSearchTerm] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [sort, setSort] = useState<"new" | "active" | "top">("new");
	const [page, setPage] = useState(1);
	const [pageSize] = useState(15);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(1);
	const [loading, setLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [composerCategoryId, setComposerCategoryId] = useState("");

	useEffect(() => {
		if (!token) {
			return;
		}

		void (async () => {
			try {
				const nextCategories = await fetchForumCategories(token);
				setCategories(nextCategories);
				if (!composerCategoryId && nextCategories.length > 0) {
					setComposerCategoryId(nextCategories[0].id);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to load categories";
				notifyError(message, "Forum");
			}
		})();
	}, [composerCategoryId, notifyError, token]);

	useEffect(() => {
		if (!token) {
			return;
		}

		setLoading(true);
		void (async () => {
			try {
				const data = await fetchForumPosts(token, {
					search: searchTerm || undefined,
					categoryId: categoryId || undefined,
					sort,
					page,
					pageSize,
				});
				setPosts(data.posts);
				setTotal(data.total);
				setTotalPages(data.totalPages);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to load posts";
				notifyError(message, "Forum");
			} finally {
				setLoading(false);
			}
		})();
	}, [categoryId, notifyError, page, pageSize, searchTerm, sort, token]);

	const postCountLabel = useMemo(() => `${total} posts`, [total]);

	const submitSearch = (event: FormEvent) => {
		event.preventDefault();
		setPage(1);
		setSearchTerm(searchInput.trim());
	};

	const submitPost = async (event: FormEvent) => {
		event.preventDefault();
		const trimmedTitle = title.trim();
		const trimmedContent = content.trim();

		if (!composerCategoryId) {
			notifyWarning("Select a category before posting.", "Forum");
			return;
		}

		if (trimmedTitle.length < 3 || trimmedTitle.length > 180) {
			notifyWarning("Title must be between 3 and 180 characters.", "Forum");
			return;
		}

		if (!trimmedContent) {
			notifyWarning("Content cannot be empty.", "Forum");
			return;
		}

		if (!token) {
			return;
		}

		setSubmitting(true);
		try {
			const post = await createForumPost(token, {
				categoryId: composerCategoryId,
				title: trimmedTitle,
				content: trimmedContent,
			});
			setTitle("");
			setContent("");
			notifySuccess("Forum post published.", "Forum");
			navigate(`/forum/${post.id}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to create post";
			notifyError(message, "Forum");
		} finally {
			setSubmitting(false);
		}
	};

	const handleReaction = async (postId: string, nextReaction: "like" | "dislike") => {
		if (!token) {
			return;
		}

		try {
			const post = posts.find((entry) => entry.id === postId);
			const normalizedReaction = post?.viewerReaction === nextReaction ? null : nextReaction;
			const result = await setForumPostReaction(token, postId, normalizedReaction);

			setPosts((current) =>
				current.map((entry) =>
					entry.id === postId
						? {
							...entry,
							likeCount: result.likeCount,
							dislikeCount: result.dislikeCount,
							viewerReaction: result.viewerReaction,
						}
						: entry,
				),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to update reaction";
			notifyError(message, "Forum");
		}
	};

	return (
		<section className="ui-section forum-page">
			<div className="page-title-row">
				<h1>Forum</h1>
				<span className="muted">{postCountLabel}</span>
			</div>

			<form className="card ui-surface forum-create-form" onSubmit={submitPost}>
				<h2>Create post</h2>
				<div className="forum-create-grid">
					<select
						value={composerCategoryId}
						onChange={(event) => setComposerCategoryId(event.target.value)}
						required
					>
						<option value="" disabled>
							Select category
						</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					<input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Post title"
						maxLength={180}
						required
					/>
				</div>
				<textarea
					value={content}
					onChange={(event) => setContent(event.target.value)}
					placeholder="Write your post. Emojis and special characters are supported."
					rows={4}
					maxLength={10_000}
					required
				/>
				<div className="forum-form-footer">
					<span className="muted">{content.length}/10000</span>
					<button type="submit" disabled={submitting}>
						{submitting ? "Posting..." : "Publish"}
					</button>
				</div>
			</form>

			<form className="card ui-surface forum-filter-row" onSubmit={submitSearch}>
				<input
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
					placeholder="Search post titles and descriptions"
				/>
				<select
					value={categoryId}
					onChange={(event) => {
						setCategoryId(event.target.value);
						setPage(1);
					}}
				>
					<option value="">All categories</option>
					{categories.map((category) => (
						<option key={category.id} value={category.id}>
							{category.name}
						</option>
					))}
				</select>
				<select
					value={sort}
					onChange={(event) => {
						setSort(event.target.value as "new" | "active" | "top");
						setPage(1);
					}}
				>
					<option value="new">Newest</option>
					<option value="active">Most active</option>
					<option value="top">Most viewed</option>
				</select>
				<button type="submit">Search</button>
			</form>

			{loading ? <p className="muted">Loading forum posts...</p> : null}

			<div className="list-stack forum-post-list">
				{!loading && posts.length === 0 ? <p className="muted">No forum posts found.</p> : null}
				{posts.map((post) => (
					<article key={post.id} className="card ui-surface forum-post-card">
						<div className="forum-post-head">
							<img src={resolveAvatarUrl(post.author.avatar, post.author.username)} alt={post.author.username} />
							<div>
								<Link to={`/forum/${post.id}`} className="forum-post-title-link">
									<h3>{post.title}</h3>
								</Link>
								<p className="muted">
									{post.author.username} in {post.category.name} | {formatRelativeTime(post.createdAt)}
								</p>
							</div>
						</div>
						<p className="forum-post-preview">{post.content}</p>
						<div className="forum-post-meta">
							<span>{post.replyCount} comments</span>
							<span>{post.viewCount} views</span>
							<button
								type="button"
								className={post.viewerReaction === "like" ? "forum-react-active" : ""}
								onClick={() => void handleReaction(post.id, "like")}
							>
								Like ({post.likeCount})
							</button>
							<button
								type="button"
								className={post.viewerReaction === "dislike" ? "forum-react-active" : ""}
								onClick={() => void handleReaction(post.id, "dislike")}
							>
								Dislike ({post.dislikeCount})
							</button>
							<Link to={`/forum/${post.id}`}>Open thread</Link>
						</div>
					</article>
				))}
			</div>

			<div className="forum-pagination card ui-surface">
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => setPage((current) => Math.max(1, current - 1))}
				>
					Previous
				</button>
				<span className="muted">
					Page {page} of {totalPages}
				</span>
				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
				>
					Next
				</button>
			</div>
		</section>
	);
};

export default Forum;
