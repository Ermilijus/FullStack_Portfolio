import { FormEvent, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useNotifications } from "../context/NotificationContext";

type ForumPost = {
	id: number;
	author: string;
	text: string;
	createdAt: string;
};

const Forum = () => {
	const { user } = useAppContext();
	const { notifySuccess, notifyWarning } = useNotifications();
	const [message, setMessage] = useState("");
	const [posts, setPosts] = useState<ForumPost[]>([
		{
			id: 1,
			author: "System",
			text: "Forum initialized. Share your next build milestone.",
			createdAt: new Date().toLocaleString(),
		},
	]);

	const postCount = useMemo(() => posts.length, [posts]);

	const submitPost = (event: FormEvent) => {
		event.preventDefault();
		const trimmed = message.trim();
		if (!trimmed) {
			notifyWarning("Write something before posting.", "Forum");
			return;
		}

		setPosts((current) => [
			{
				id: Date.now(),
				author: user?.username ?? user?.email ?? "Anonymous",
				text: trimmed,
				createdAt: new Date().toLocaleString(),
			},
			...current,
		]);
		setMessage("");
		notifySuccess("Forum post published.", "Forum");
	};

	return (
		<section className="ui-section forum-page">
			<div className="page-title-row">
				<h1>Forum</h1>
				<span className="muted">{postCount} posts</span>
			</div>

			<form className="card ui-surface inline-form" onSubmit={submitPost}>
				<input
					value={message}
					onChange={(event) => setMessage(event.target.value)}
					placeholder="Post an update..."
					maxLength={280}
				/>
				<button type="submit">Post</button>
			</form>

			<div className="list-stack">
				{posts.map((post) => (
					<article key={post.id} className="card ui-surface">
						<h3>{post.author}</h3>
						<p>{post.text}</p>
						<p className="muted">{post.createdAt}</p>
					</article>
				))}
			</div>
		</section>
	);
};

export default Forum;
