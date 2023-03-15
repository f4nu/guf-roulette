let ENVIRONMENT;

function ok() {
	return new Response(JSON.stringify({}), {
		headers: {
			'content-type': 'application/json;charset=UTF-8',
		},
	});
}

async function sendMessage(env, chatId, text, messageId) {
	log("Sending message: " + text + " to chat " + chatId + " in reply of " + messageId + "");
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

	log("Restricting user " + userId + " in chat " + chatId + " until " + untilDate + " with permissions " + JSON.stringify(permissions) + "");
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
	console.log(response.status, await response.json());
	return response;
}

async function getLeaderboardText(env) {
	let leaderboard = await env.DICE_LEADERBOARD.list({prefix: 'dice_'});
	leaderboard = leaderboard.keys.sort((a, b) => {
		return parseInt(b.metadata.points) - parseInt(a.metadata.points);
	});
	const medals = ['🥇', '🥈', '🥉', '', ''];
	log(leaderboard);
	return leaderboard
		.map((k, i) => medals[i] + k.metadata.nickname + ": " + k.metadata.points + " punti")
		.slice(0, 5)
		.join("\n")
		;
}

function passedEnoughTime(now, lastTimestamp, seconds) {
	return now - lastTimestamp > seconds;
}

async function saveLastLeaderboardTimestamp(env, timestamp) {
	return await env.DICE_LEADERBOARD.put('last_leaderboard_timestamp', timestamp);
}

async function putPointsInLeaderboard(env, key, currentPoints, nickname) {
	return await env.DICE_LEADERBOARD.put(
		key,
		currentPoints,
		{
			metadata: {
				nickname: nickname,
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
			return -3;
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

function log(object) {
	if (ENVIRONMENT !== 'staging')
		return;

	console.log(object);
}

export default {
	async fetch(request, env, ctx) {
		ENVIRONMENT = env.ENVIRONMENT;
		let chatId = env.CHAT_ID;
		const data = await request.json().catch(() => ({}));

		const isMainChat = data.message?.chat?.id == chatId;

		if (!isMainChat) {
			console.log("Wrong chat id: " + data.message?.chat?.id);
			return ok();
		}

		log(data);

		chatId = data.message?.chat?.id;

		const diceValue = data.message?.dice?.value;
		const emoji = data.message?.dice?.emoji;
		const messageId = data.message?.message_id;
		const userId = data.message?.from?.id;
		log({diceValue: diceValue, emoji: emoji, messageId: messageId, userId: userId});

		if (data.message?.text === '!leaderboard') {
			log("Showing leaderboard");
			const lastLeaderboardTimestamp = parseInt(await env.DICE_LEADERBOARD.get('last_leaderboard_timestamp') || 0);
			const timestamp = Math.floor(Date.now() / 1000);
			log({lastLeaderboardTimestamp: lastLeaderboardTimestamp, timestamp: timestamp});
			if (!passedEnoughTime(timestamp, lastLeaderboardTimestamp, 60))
				return ok();
			
			await saveLastLeaderboardTimestamp(env, timestamp);
			await sendMessage(env, chatId, await getLeaderboardText(env), messageId);
			return ok();
		}

		if (data.message?.text === '🥝') {
			log("Kiwis are not allowed here!");
			await sendMessage(env, chatId, '💥🔫 Nope.', messageId);
			await restrictChatMember(env, chatId, userId, Math.floor(Date.now() / 1000) + (60 * 5), false);
			return ok();
		}
		
		if (!diceValue) {
			return ok();
		}

		const points = getPoints(emoji, diceValue);
		const key = `dice_${userId}`;
		const oldPoints = parseInt(await env.DICE_LEADERBOARD.get(key) || 0);
		let currentPoints = oldPoints + points;
		await putPointsInLeaderboard(env, key, currentPoints, data.message?.from?.username);

		await sendMessage(env, chatId, getRouletteText(points, currentPoints), messageId);
		if (points <= 0)
			await restrictChatMember(env, chatId, userId, Math.floor(Date.now() / 1000) + (60 * 5), points == 0 || points == -1);

		return ok();
	},
};
