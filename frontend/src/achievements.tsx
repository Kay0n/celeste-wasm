import { achievements, glowingAchievements } from "./achievementData";

export type Achievement = {
	hidden: boolean;
	unlocked_image: string;
	locked_image: string;
	name: string;
	description: string;
};

const steamStore: Stateful<{
	achievements: string[];
}> = $store(
	{
		achievements: [],
	},
	{ ident: "achievements", backing: "localstorage", autosave: "auto" }
);

export function getUnlockedAchievements(): Record<string, Achievement> {
	return Object.fromEntries(
		steamStore.achievements.map((x) => [x, achievements[x]] as const)
	);
}

export function getLockedAchievements(): Record<string, Achievement> {
	return Object.fromEntries(
		Object.entries(achievements).filter(
			([id, _]) => !steamStore.achievements.includes(id)
		)
	);
}

export const SteamJS = {
	GetAchievement(achievement: string) {
		return steamStore.achievements.includes(achievement);
	},
	SetAchievement(achievement: string) {
		steamStore.achievements.push(achievement);
		steamStore.achievements = steamStore.achievements;
	},

	GetStat(stat: string) {
		console.debug(`GetStat("${stat}")`);
		return 0;
	},
	SetStat(stat: string, value: number) {
		console.debug(`SetStat("${stat}", ${value})`);
	},
};

(self as any).achievements = {
	steamStore,
	getUnlockedAchievements,
	getLockedAchievements,
};

export const Achievements: Component<
	{
		open: boolean;
	},
	{
		unlocked: [string, Achievement][];
		locked: [string, Achievement][];
	}
> = function () {
	this.unlocked = [];
	this.locked = [];

	this.css = `
		.achievements {
			display: flex;
			flex-direction: column;
			gap: 1em;
			margin-block: 1em;
		}

		h3 {
			margin-block: 0;
		}

		.achievement {
			display: flex;
			gap: 0.8rem;

			background: var(--surface1);
			padding: 0.5rem;
		}
		.achievement.unlocked {
			background: var(--surface2);
		}

		.achievement .inner {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			justify-content: center;
		}

		.achievement > .inner > :first-child {
			font-size: 1.25rem;
			font-family: var(--font-display);
		}

		.achievement:not(.unlocked).hidden > .inner > :last-child {
			display: none;
		}

		.padding {
			margin-bottom: 8rem;
		}

		/* https://codepen.io/Dataminer/pen/pooWzpo */
		.image {
			display: inline-block;
			position: relative;
			height: 64px;
			width: 64px;
			border-radius: 3px;
		}
		.image .glow-root, .image .glow-container, .image .glow {
			position: absolute;
			top: -10px;
			right: -10px;
			bottom: -10px;
			left: -10px;
		}
		.image .glow-root {
			mask-image: url("steam-glow-outer.webp");
			mask-repeat: repeat;
			mask-size: 100%;	
		}
		.image .glow-container {
			animation-name: rotate;
			animation-duration: 18s;
			animation-timing-function: linear;
			animation-iteration-count: infinite;
			animation-direction: reverse;
			mask-image: url("steam-glow-inner.webp");
			mask-repeat: repeat;
			mask-size: 100%;
		}
		.image .glow {
			animation-name: rotate;
			animation-duration: 6s;
			animation-timing-function: linear;
			animation-iteration-count: infinite;	
		}
		.image img {
			position: relative;
			vertical-align: top;
			height: 64px;
			width: 64px;
		}
		.unlocked .image .glows .glow {
			background: radial-gradient(rgba(255, 201, 109, 0.178) 0%, rgba(255, 201, 109, 0) 6%, rgba(255, 201, 109, 0.178) 10%, #ffb84e 26%, rgba(255, 201, 109, 0.178) 35%, #ffb84e 40%, rgba(255, 201, 109, 0.178) 60%, #ffb84e 82%, rgba(255, 201, 109, 0.178) 100%);
		}
		.unlocked .image:has(.glows) img {
			box-shadow: 0px 0px 2px 1px rgba(255, 184, 78, 0.6), 0px 0px 16px 1px rgba(255, 217, 78, 0.4);
		}
		@keyframes rotate {
			to {
				transform: rotate(1turn);
			} 
		}
	`;

	useChange([steamStore.achievements], () => {
		this.unlocked = Object.entries(getUnlockedAchievements());
		this.locked = Object.entries(getLockedAchievements());
	});

	const createAchievement = (
		id: string,
		achievement: Achievement,
		unlocked: boolean
	) => {
		return (
			<div
				class={`achievement ${unlocked ? "unlocked" : ""} ${achievement.hidden ? "hidden" : ""}`}
			>
				<div class="image">
					<div
						class={`glow-root ${glowingAchievements.includes(id) ? "glows" : ""}`}
					>
						<div class="glow-container">
							<div class="glow" />
						</div>
					</div>
					<img
						alt={`Achievement ${achievement.name}`}
						src={
							unlocked ? achievement.unlocked_image : achievement.locked_image
						}
					/>
				</div>
				<div class="inner">
					<div>{achievement.name}</div>
					<div>{achievement.description}</div>
				</div>
			</div>
		);
	};

	return (
		<div>
			{$if(
				use(this.unlocked, (x) => x.length > 0),
				<div>
					<h3>Unlocked</h3>
					<div class="achievements">
						{use(this.unlocked, (x) =>
							x.map(([id, x]) => createAchievement(id, x, true))
						)}
					</div>
				</div>
			)}

			<div>
				<h3>Locked</h3>
				<div class="achievements">
					{use(this.locked, (x) =>
						x.map(([id, x]) => createAchievement(id, x, false))
					)}
				</div>
			</div>
			<div class="padding" />
		</div>
	);
};
