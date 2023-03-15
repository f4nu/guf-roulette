function ok() {
	return new Response(JSON.stringify({}), {
		headers: {
			'content-type': 'application/json;charset=UTF-8',
		},
	});
}

async function sendMessage(env, chatId, text, messageId) {
	return await fetch(
		`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
		{
			method: 'POST',
			headers: {
				'content-type': 'application/json;charset=UTF-8',
			},
			body: JSON.stringify({
				chat_id: chatId,
				text: text,
				disable_notification: true,
				reply_to_message_id: messageId,
			}),
		},
	);
}

async function restrictChatMember(env, chatId, userId, untilDate, canSendMessages) {
	const permissions = {
		can_send_messages: canSendMessages,
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

	const response = await fetch(
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
				until_date: untilDate,
			}),
		},
	);
	console.log(response.status, response.body);
	return response;
}

async function getLeaderboardText() {
	let leaderboard = await env.DICE_LEADERBOARD.list({prefix: 'dice_'});
	leaderboard = leaderboard.keys.sort((a, b) => {
		return parseInt(b.metadata.points) - parseInt(a.metadata.points);
	});
	const medals = ['🥇', '🥈', '🥉', '', ''];
	return leaderboard
		.map((k, i) => medals[i] + k.metadata.nickname + ": " + k.metadata.points + " punti")
		.slice(0, 5)
		.join("\n")
		;
}

function passedEnoughTime(now, lastTimestamp, seconds) {
	return now - lastTimestamp > seconds;
}

async function saveLastLeaderboardTimestamp(timestamp) {
	return await env.DICE_LEADERBOARD.put('last_leaderboard_timestamp', timestamp);
}

async function putPointsInLeaderboard(env, key, currentPoints) {
	return await env.DICE_LEADERBOARD.put(
		key,
		currentPoints,
		{
			metadata: {
				nickname: data.message?.from?.username,
				points: currentPoints
			}
		});
}

function getPoints(emoji, diceValue) {
	// Value of the dice, 1-6 for “🎲”, “🎯” and “🎳” base emoji, 1-5 for “🏀” and “⚽” base emoji, 1-64 for “🎰” base emoji
	if (emoji === '🎲' || emoji === '🎯' || emoji === '🎳') {
		if (diceValue === 6)
			return 5;
		else if (diceValue === 1)
			return -2;
	} else if (emoji === '🏀') {
		if (diceValue === 5 || diceValue === 4)
			return 2;
		else if (diceValue === 3)
			return -2;
	} else if (emoji === '⚽') {
		if (diceValue === 5 || diceValue === 4 || diceValue === 3)
			return 1;
		else if (diceValue === 2)
			return -2;
	} else if (emoji === '🎰') {
		// 1: bar, 22: cherry, 43: lemon, 64: 777
		if (diceValue === 1 || diceValue === 22 || diceValue === 43)
			return 10;
		else if (diceValue === 64)
			return 69;
	}

	return -1;
}

function getRouletteText(points, currentPoints) {
	if (points > 10)
		return `😱 Hai stravinto! Vola in classifica con ${currentPoints} punti! (+${points})`;
	else if (points > 0)
		return `🎉 Hai vinto! Ora hai ${currentPoints} punti. (+${points})`;
	else if (points < -1)
		return `💥🔫 Nope.`;
	
	return `💥🔫`;
}

export default {
	async fetch(request, env, ctx) {
		let chatId = env.CHAT_ID;
		const testChatId = env.CHAT_ID_TEST;
		const data = await request.json().catch(() => ({}));

		const isMainChat = data.message?.chat?.id == chatId;
		const isTestChat = data.message?.chat?.id == testChatId;

		if (!isMainChat && !isTestChat) {
			console.log("Wrong chat id: " + data.message?.chat?.id);
			return ok();
		}

		chatId = data.message?.chat?.id;

		const diceValue = data.message?.dice?.value;
		const emoji = data.message?.dice?.emoji;
		const messageId = data.message?.message_id;
		const userId = data.message?.from?.id;

		if (data.message?.text === '!leaderboard') {
			const lastLeaderboardTimestamp = parseInt(await env.DICE_LEADERBOARD.get('last_leaderboard_timestamp') || 0);
			const timestamp = Math.floor(Date.now() / 1000);
			if (passedEnoughTime(timestamp, lastLeaderboardTimestamp, 60))
				return ok();
			
			saveLastLeaderboardTimestamp(timestamp);
			sendMessage(env, chatId, getLeaderboardText(), messageId);
			return ok();
		}

		if (data.message?.text === '🥝') {
			sendMessage(env, chatId, '💥🔫 Nope.', messageId);
			restrictChatMember(env, chatId, userId, Math.floor(Date.now() / 1000) + (60 * 5), false);
			return ok();
		}
		
		if (!diceValue) {
			return ok();
		}

		const points = getPoints(emoji, diceValue);
		const key = `dice_${userId}`;
		const oldPoints = parseInt(await env.DICE_LEADERBOARD.get(key) || 0);
		let currentPoints = oldPoints + points;
		putPointsInLeaderboard(env, key, currentPoints);

		sendMessage(env, chatId, getRouletteText(points, currentPoints), messageId);
		if (points <= 0)
			restrictChatMember(env, chatId, userId, Math.floor(Date.now() / 1000) + (60 * 5), points == 0 || points == -1);

		return ok();
	},
};
