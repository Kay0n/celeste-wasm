import { gameState, play, stop, GameView, LogView } from "./game/index";
import { Dialog } from "./ui/Dialog";
import { Button, Icon } from "./ui/Button";
import { store } from "./store";

import { Achievements } from "./achievements";
import { Settings } from "./settings";

import iconPlayArrow from "@ktibow/iconset-material-symbols/play-arrow";
import iconStop from "@ktibow/iconset-material-symbols/stop";
import iconFullscreen from "@ktibow/iconset-material-symbols/fullscreen";
import iconTrophy from "@ktibow/iconset-material-symbols/trophy";
import iconSettings from "@ktibow/iconset-material-symbols/settings";

export const NAME = "webleste";

export const Logo: Component<{}, {}> = function () {
	this.css = `
		display: flex;
		align-items: center;
		font-size: 1.5rem;

		font-family: var(--font-display);
		color: var(--fg);

		&:hover {
		  color: var(--accent);
		}

		img {
			image-rendering: pixelated;
			-ms-interpolation-mode: nearest-neighbor;
			width: 3rem;
			height: 3rem;
		}

		.extras {
			align-self: start;
			padding: 0.25rem 0;
			font-size: 1rem;
			color: var(--fg6);

			display: flex;
			flex-direction: column;
			justify-content: space-between;
		}
	`;
	return (
		<a href="https://github.com/MercuryWorkshop/celeste-wasm" target="_blank">
			<img alt="Celeste icon" src="./app.webp" />
			<span>{NAME}</span>
			<div class="extras">
				<span class="ver">v1.4.0.0</span>
			</div>
		</a>
	);
};

const TopBar: Component<
	{
		canvas: HTMLCanvasElement;
		achievementsOpen: boolean;
		settingsOpen: boolean;
	},
	{ allowPlay: boolean; fps: HTMLElement }
> = function () {
	this.css = `
		background: var(--bg);
		padding: 1em;
		border-bottom: 1.75px solid var(--surface2);
		transition: background 150ms, color 150ms, border-color 150ms;
		transition-timing-function: ease;
		display: flex;
		align-items: stretch;
		width: 100%;
		gap: 0.5rem;

		flex: 0 0;

		.group {
			display: flex;
			align-items: center;
			gap: 1rem;
		}

		.expand { flex: 1; }

		@media (max-width: 750px) {
			& {
				flex-direction: column;
			}
			.group {
				justify-content: space-evenly;
			}
		}
	`;

	useChange([gameState.ready, gameState.playing], () => {
		this.allowPlay = gameState.ready && !gameState.playing;
	});

	return (
		<div>
			<div class="group">
				<Logo />
			</div>
			<div class="expand" />
			<div class="group">
				<Button
					on:click={() => (this.achievementsOpen = true)}
					icon="full"
					type="normal"
					disabled={false}
					title={"Achievements"}
				>
					<Icon icon={iconTrophy} />
				</Button>
				<Button
					icon="full"
					type="normal"
					disabled={false}
					title="Settings"
					on:click={() => {
						this.settingsOpen = true;
					}}
				>
					<Icon icon={iconSettings} />
				</Button>
				<Button
					on:click={async () => {
						try {
							await this.canvas.requestFullscreen({ navigationUI: "hide" });
						} catch {}
					}}
					icon="full"
					type="normal"
					disabled={use(gameState.playing, (x) => !x)}
					title={"Fullscreen"}
				>
					<Icon icon={iconFullscreen} />
				</Button>
				{$if(
					use(gameState.playing),
					<Button
						on:click={stop}
						icon="left"
						type="primary"
						disabled={false}
						title={"Stop Game (reloads the page)"}
					>
						<Icon icon={iconStop} />
						<span>Stop</span>
					</Button>,
					<Button
						on:click={() => {
							play();
						}}
						icon="left"
						type="primary"
						disabled={use(this.allowPlay, (x) => !x)}
						title={"Start Game"}
					>
						<Icon icon={iconPlayArrow} />
						<span>Play</span>
					</Button>
				)}
			</div>
		</div>
	);
};

export const Main: Component<
	{},
	{
		canvas: HTMLCanvasElement;
		achievementsOpen: boolean;
		settingsOpen: boolean;
		logcontainer: HTMLDivElement;

		dialogs?: HTMLDivElement;

		logsize: number;
	},
	{
		start: () => Promise<void>;
	}
> = function () {
	this.css = `
		width: 100%;
		height: 100%;
		background: var(--bg-sub);
		color: var(--fg);

		display: flex;
		flex-direction: column;
		align-items: center;

		transition: background 150ms, color 150ms;

		.game {
			aspect-ratio: 16 / 9;
			flex: 0 1 min(calc(9 * 100vw / 16), 100vh);
		}

		.logs {
			display: flex;
			flex-direction: column;

			width: 100%;
			padding: 0 0.5em 0.5em 0.5em;

			background: var(--bg-sub);
		}

		.resizer {
			background: var(--surface1);
			cursor: ns-resize;
			width: 100%;
			flex: 0 0 0.25em;
		}

		.main h2 {
			margin: 0;
		}

		.expand { flex: 1; }
	`;

	this.achievementsOpen = false;

	this.mount = () => {
		useChange([store.logs], (x) => {
			this.logcontainer.style.height = `${x}px`;
			this.logsize = x;
		});
	};

	const game = <GameView bind:canvas={use(this.canvas)} />;

	const init = async () => {
		this.dialogs = (
			<div>
				<Dialog name="Achievements" bind:open={use(this.achievementsOpen)}>
					<Achievements open={use(this.achievementsOpen)} />
				</Dialog>
				<Dialog name="Settings" bind:open={use(this.settingsOpen)}>
					<Settings />
				</Dialog>
			</div>
		) as HTMLDivElement;
		await (game.$ as ComponentType<typeof GameView>).start();
	};
	// the splash waits on this before patching, so hand back the same promise
	let started: Promise<void> | null = null;
	this.start = () => (started ??= init());

	this.logsize = 0;

	return (
		<div style={use`--logsize: ${use(this.logsize, (x) => x || 0)}px;`}>
			<TopBar
				canvas={use(this.canvas)}
				bind:achievementsOpen={use(this.achievementsOpen)}
				bind:settingsOpen={use(this.settingsOpen)}
			/>
			<div class="game">{game}</div>
			<div class="expand" />
			{$if(
				use(store.logs, (x) => x > 0) /* @ts-expect-error */,
				<>
					<div
						class="resizer"
						on:mousedown={(e: MouseEvent) => {
							const startY = e.clientY;
							const startHeight = this.logcontainer.clientHeight;
							let height: number;
							const onMouseMove = (e: MouseEvent) => {
								height = startHeight + startY - e.clientY;
								this.logcontainer.style.height = `${height}px`;
								this.logsize = height;
							};
							const onMouseUp = () => {
								document.removeEventListener("mousemove", onMouseMove);
								document.removeEventListener("mouseup", onMouseUp);
								store.logs = height;
								this.logsize = height;
							};
							document.addEventListener("mousemove", onMouseMove);
							document.addEventListener("mouseup", onMouseUp);
						}}
					></div>
					<div class="logs" bind:this={use(this.logcontainer)}>
						<LogView scrolling={true} />
					</div>
				</>
			)}
			{use(this.dialogs)}
		</div>
	);
};
