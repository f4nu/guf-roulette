export default {
	async fetch(
		request: Request,
	): Promise<Response> {
		const randomNumberBetweenOneAndSix = Math.floor(Math.random() * 6) + 1;
		const wonTheRoulette = randomNumberBetweenOneAndSix === 6;
		// Connect to Telegram Bot API to send a message to the user

		console.log(request.headers);
		
		return new Response(wonTheRoulette ? "You won!" : "You lost!");
	},
};
