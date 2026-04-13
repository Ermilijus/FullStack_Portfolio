import { FormEvent, useState } from "react";
import { useNotifications } from "../context/NotificationContext";

type TradeOffer = {
	id: number;
	offering: string;
	requesting: string;
};

const Trade = () => {
	const { notifySuccess, notifyWarning } = useNotifications();
	const [offering, setOffering] = useState("");
	const [requesting, setRequesting] = useState("");
	const [offers, setOffers] = useState<TradeOffer[]>([]);

	const createOffer = (event: FormEvent) => {
		event.preventDefault();

		if (!offering.trim() || !requesting.trim()) {
			notifyWarning("Fill in both sides of the trade offer.", "Trade");
			return;
		}

		setOffers((current) => [
			{
				id: Date.now(),
				offering: offering.trim(),
				requesting: requesting.trim(),
			},
			...current,
		]);

		setOffering("");
		setRequesting("");
		notifySuccess("Trade offer created.", "Trade");
	};

	return (
		<section className="ui-section trade-page">
			<div className="page-title-row">
				<h1>Trade</h1>
				<span className="muted">Open offers: {offers.length}</span>
			</div>

			<form className="card ui-surface inline-form" onSubmit={createOffer}>
				<input
					value={offering}
					onChange={(event) => setOffering(event.target.value)}
					placeholder="What are you offering?"
				/>
				<input
					value={requesting}
					onChange={(event) => setRequesting(event.target.value)}
					placeholder="What do you want in return?"
				/>
				<button type="submit">Create Offer</button>
			</form>

			<div className="list-stack">
				{offers.length === 0 ? (
					<p className="muted">No active offers yet.</p>
				) : (
					offers.map((offer) => (
						<article key={offer.id} className="card ui-surface">
							<h3>{offer.offering}</h3>
							<p>Requested: {offer.requesting}</p>
						</article>
					))
				)}
			</div>
		</section>
	);
};

export default Trade;
