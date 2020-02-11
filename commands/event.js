const datePattern = /([1-2][0-9]{3})([\-/])([0-9]{1,2})([\-/])([0-9]{1,2})/;
const timePattern = /([0-2][0-9]):([0-5][0-9])/;

function isDateCorrect(date, input) {
	return date.getFullYear() === input.year &&
		date.getMonth() === input.month - 1 &&
		date.getDate() === input.day &&
		date.getHours() === input.hour &&
		date.getMinutes() === input.minute
}

class EventManager {
	constructor(client) {
		this.client = client;
		this.timer = null;
		this.upcomingEvents = [];
	}

	start() {
		// Ensure we're always at (or close to) the 'top' of a minute when we run our tick
		const topOfMinute = 60000 - (Date.now() % 60000);
		console.log(`Waiting ${topOfMinute / 1000}s for first tick`);
		this.timer = this.client.setTimeout(() => {
			this.timer = this.client.setInterval(() => this.tick(), 60000);
			this.tick();
		}, topOfMinute);
	}

	tick() {
		const now = new Date();
		const dueEvents = this.upcomingEvents.filter(event => event.due <= now);
		this.upcomingEvents = this.upcomingEvents.filter(event => event.due > now);

		if (dueEvents) {
			dueEvents.forEach(event => {
				// Discard events we missed for more than 5 minutes
				if (now.valueOf() - event.due.valueOf() >= 300000) {
					return;
				}

				const destChannel = this.client.channels.get(event.channel);
				if (!destChannel) {
					console.log('Got event for unknown channel', event.channel);
					return;
				}

				destChannel.send(`Event '${event.name}' is starting now!`);
			})
		}
	}

	stop() {
		this.client.clearTimeout(this.timer);
		this.client.clearInterval(this.timer);
		this.timer = null;
	}

	add(event) {
		this.upcomingEvents.push(event);
	}
}

let eventManager;

async function createCommand(message, args, client) {
	const [date, time, ...nameParts] = args;
	const name = nameParts.join(' ');
	// 5 minutes from now
	const minimumDate = new Date(Date.now());

	if (!date) {
		await message.channel.send('You must specify a date for the event.');
		return;
	}

	if (!time) {
		await message.channel.send('You must specify a time for the event.');
		return;
	}

	const dateMatch = date.match(datePattern);

	if (!dateMatch) {
		await message.channel.send('The date format used wasn\'t recognized. Use `YYYY/MM/DD` or `YYYY-MM-DD`.');
		return;
	}

	const [, yearStr, , monthStr, , dayStr] = dateMatch;
	const year = parseInt(yearStr);
	const month = parseInt(monthStr);
	const day = parseInt(dayStr);

	const timeMatch = time.match(timePattern);

	if (!timeMatch) {
		await message.channel.send('The time format used wasn\'t recognized. Use `HH:MM`.');
		return;
	}

	const [, hourStr, minuteStr] = timeMatch;
	const hour = parseInt(hourStr);
	const minute = parseInt(minuteStr);

	// month is a 'month index', i.e. 0-11, because why not
	const resolvedDate = new Date(year, month - 1, day, hour, minute);

	if (!isDateCorrect(resolvedDate, {year, month, day, hour, minute})) {
		await message.channel.send(
			`The date-time ${date} ${time} is not a calendar date time (check the month/day).`
		);
		return;
	}

	if (resolvedDate < minimumDate) {
		await message.channel.send('The event must start in five minutes time or more.');
		return;
	}

	const newEvent = {
		due: resolvedDate,
		name,
		channel: message.channel.id,
	};

	eventManager.add(newEvent);
	await message.channel.send('Event created!');
}


async function listCommand(message, client) {
	const eventList = eventManager.upcomingEvents.map(event => `${event.name} (${event.due.toDateString()})`).join(', ');

	await message.channel.send('The following events are coming up: ' + eventList);
}

module.exports = {
	name: 'event',
	description: 'Allows people on a server to participate in events',
	usage: 'create [date] [time] [name] | list',
	cooldown: 3,
	guildOnly: true,
	staffOnly: true,
	args: true,
	async execute(message, args, client) {
		const [subcommand, ...cmdArgs] = args;
		switch (subcommand) {
			case 'create':
				await createCommand(message, cmdArgs, client);
				return;
			case 'list':
				await listCommand(message, client);
				return;
			case '':
				await message.channel.send('You must specify a subcommand. See help for usage.');
				return;
			default:
				await message.channel.send(`Unknown subcommand '${subcommand}'. See help for usage.'`);
				return;
		}
	},
	init(client) {
		eventManager = new EventManager(client);
		eventManager.start();
		console.log('event manager ready');
	}
};
