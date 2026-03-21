import { buildApp } from "./app.js";

const start = async () => {
	const app = await buildApp();
	try {
		await app.listen({
			host: app.config.HOST,
			port: app.config.PORT,
		});
		app.log.info(`Server listening on http://${app.config.HOST}:${app.config.PORT}`);
	} catch (error) {
		app.log.error(error);
		process.exit(1);
	}
};

void start();
