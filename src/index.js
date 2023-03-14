export default {
	async fetch(request, env, ctx) {
		const chatId = -1001976670916;
		
		const data = await request.json().catch(() => ({}));
		console.log(data);
		const userId = data.message?.from?.id;
		const diceValue = data.message?.dice?.value;
		const emoji = data.message?.dice?.emoji;
		if (data.message?.chat?.id !== chatId || !diceValue) {
			console.log("Won't parse request");
			return new Response(JSON.stringify({}), {
				headers: {
					'content-type': 'application/json;charset=UTF-8',
				},
			});
		}

		let points = 0;
		// Value of the dice, 1-6 for “🎲”, “🎯” and “🎳” base emoji, 1-5 for “🏀” and “⚽” base emoji, 1-64 for “🎰” base emoji
		if (emoji === '🎲' || emoji === '🎯' || emoji === '🎳') {
			if (diceValue === 6)
				points = 5;
		} else if (emoji === '🏀') {
			if (diceValue === 5 || diceValue === 4)
				points = 2;
			else if (diceValue === 3)
				points = -1;
		} else if (emoji === '⚽') {
			if (diceValue === 5 || diceValue === 4 || diceValue === 3)
				points = 1;
			else if (diceValue === 2)
				points = -1;
		} else if (emoji === '🎰') {
			// 1: bar, 22: cherry, 43: lemon, 64: 777
			if (diceValue === 1 || diceValue === 22 || diceValue === 43)
				points = 10;
			else if (diceValue === 64)
				points = 64;
		}

		const key = `dice_${userId}`;
		let oldPoints = parseInt(await env.DICE_LEADERBOARD.get(key) || 0);
		let currentPoints = oldPoints + points;
		env.DICE_LEADERBOARD.put(key, currentPoints, {metadata: {nickname: data.message?.from?.username}});

		const superWon = points > 10;
		const won = !superWon && points > 0;
		const lost = points == 0;
		const superLost = points < 0;

		// debug text: `won: ${won}, superLost: ${superLost}, ${emoji}: ${diceValue}. Total points: ${currentPoints}`
		let text = "";
		if (superWon)
			text = `😱 Hai stravinto! Vola in classifica con ${currentPoints} punti!`;
		else if (won)
			text = `🎉 Hai vinto! Ora hai ${currentPoints} punti.`;
		else if (superLost)
			text = `💥🔫 Nope.`;
		else
			text = `💥🔫`;
		
		await fetch(
			`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json;charset=UTF-8',
				},
				body: JSON.stringify({
					chat_id: chatId,
					text: text,
				}),
			},
		);
		
		if (superLost || lost) {
			const permissions = {
				can_send_messages: !superLost,
				can_send_audios: false,
				can_send_documents: false,
				can_send_photos: false,
				can_send_videos: false,
				can_send_video_notes: false,
				can_send_voice_notes: false,
				can_send_polls: false,
				can_send_other_messages: false,
				can_add_web_page_previews: false,
				can_change_info: false,
				can_invite_users: false,
				can_pin_messages: false,
				can_manage_topics: false,
			};
			// Use restrictChatMember to restrict the user to send messages for 5 minutes
			const restrictResponse = await fetch(
				`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/restrictChatMember`,
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json;charset=UTF-8',
					},
					body: JSON.stringify({
						chat_id: chatId,
						user_id: userId,
						permissions: permissions,
						until_date: Math.floor(Date.now() / 1000) + (60 * 5),
					}),
				},
			);
		}
		return new Response(JSON.stringify({}), {
			headers: {
				'content-type': 'application/json;charset=UTF-8',
			}
		});
	},
};
