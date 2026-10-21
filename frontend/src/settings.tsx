import { Switch } from "./ui/Switch";
import { store } from "./store";
import { TextField } from "./ui/TextField";
import { Button, Icon } from "./ui/Button";
import { analyticsEnabled, event } from "./analytics";
import { downloadSaves, uploadSaves } from "./fs";
import { loadAchievements } from "./achievements";
import { gameState } from "./game";

import iconDownload from "@ktibow/iconset-material-symbols/download";
import iconUpload from "@ktibow/iconset-material-symbols/upload";

export const Settings: Component<
	{},
	{
		darkMode: boolean;
		showLogs: boolean;
		busy: boolean;
		uploadDisabled: boolean;
		status: string;
		input: HTMLInputElement;
	}
> = function () {
	this.css = `
		display: flex;
		overflow-x: hidden;
		overflow-y: auto;
		flex-direction: column;
		gap: 0.8rem;

		.setting,
		.component-switch {
			margin-inline: 0.25rem;
		}

		.setting {
			display: flex;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			margin-inline: 0.25rem;
		}

		.buttons {
			display: flex;
			gap: 0.5rem;
		}

		.status {
			margin-inline: 0.25rem;
		}
  `;

	this.darkMode = store.theme === "dark";

	this.showLogs = store.logs > 0;
	this.busy = false;
	this.status = "";
	// the running game keeps its save data in memory and would overwrite an upload
	useChange([this.busy, gameState.playing], () => {
		this.uploadDisabled = this.busy || gameState.playing;
	});

	const run = async (action: () => Promise<void>, done: string) => {
		this.busy = true;
		this.status = "";
		try {
			await action();
			this.status = done;
		} catch (err) {
			console.error(err);
			this.status = `Failed: ${err instanceof Error ? err.message : err}`;
		} finally {
			this.busy = false;
		}
	};

	const upload = async () => {
		const file: File = await new Promise((res) => {
			this.input.value = "";
			this.input.onchange = () => res(this.input.files![0]);
			this.input.click();
		});
		if (
			!file ||
			!confirm("Replace your current saves, settings and achievements?")
		)
			return;
		await run(async () => {
			await uploadSaves(file);
			await loadAchievements();
		}, "Saves restored.");
	};

	return (
		<div>
			<Switch
				title="Dark Mode"
				bind:on={use(this.darkMode)}
				on:change={(e: Event) => {
					store.theme = (e.target as HTMLInputElement).checked
						? "dark"
						: "light";
				}}
				disabled={false}
			/>
			<Switch
				title="Show Logs"
				bind:on={use(this.showLogs)}
				disabled={false}
				on:change={(e: Event) => {
					store.logs = (e.target as HTMLInputElement).checked ? 1 : -1;
				}}
			/>
			<WispServer />
			<div>
				<div style="margin-inline: 0.2rem; user-select: none;">
					Accent Color
				</div>
				<AccentPicker />
			</div>
			<div class="setting">
				<span>Saves</span>
				<div class="buttons">
					<Button
						type="normal"
						icon="left"
						disabled={use(this.busy)}
						on:click={() => run(downloadSaves, "")}
						title="Download saves, settings and achievements"
					>
						<Icon icon={iconDownload} />
						<span>Download</span>
					</Button>
					<Button
						type="normal"
						icon="left"
						disabled={use(this.uploadDisabled)}
						on:click={upload}
						title="Replace saves, settings and achievements with a downloaded archive"
					>
						<Icon icon={iconUpload} />
						<span>Upload</span>
					</Button>
				</div>
				<input
					type="file"
					accept=".tar,.gz,.tar.gz"
					style="display: none"
					bind:this={use(this.input)}
				/>
			</div>
			{$if(use(this.status), <div class="status">{use(this.status)}</div>)}
			{/* @ts-expect-error fragment */}
			{analyticsEnabled ? (<>
				<div>
					This instance of Webleste has analytics for figuring out how many people are affected by r58playz's random regressions.
					We send an event on page load, when the game finishes downloading, when you finish patching (with whether you chose to install Everest), when you click the play button, and when you turn this off (but not after).
				</div>
				<Switch title="Enable Analytics" bind:on={use(store.analytics)} disabled={false} on:change={() => event("analytics-toggle", { enabled: store.analytics })} />
			</>) : null}
		</div>
	);
};

export const WispServer: Component<{}> = function () {
	this.css = `
		display: flex;
		flex-direction: row;
		align-items: center;
		margin-inline: 0.25rem;
		gap: 0.5rem;

		input {
			flex: 1;
		}
	`;

	return (
		<div>
			<span>Wisp Proxy Server:</span>
			<TextField
				bind:value={use(store.wispServer)}
				placeholder={"wss://" + import.meta.env.VITE_WISP_URL}
			/>
		</div>
	);
};

const AccentPicker: Component<{}> = function () {
	this.css = `
		display: flex;
		flex-wrap: nowrap;
		max-width: 100%;
		justify-content: space-between;
		align-items: center;
		margin-inline: 0.2rem;
		padding-block: 10px;
		padding-inline: calc(0.25rem + 5.25px);
		margin-top: 0.2rem;

		button {
			border: none;
			appearance: none;
			cursor: pointer;
			background-color: var(--accent);
			height: 2.2rem;
			width: 2.2rem;
			font-size: 1.35rem;
			font-family: var(--font-display);
			color: var(--bg);
			border-radius: 50%;
			outline: 2px solid var(--accent);
			outline-offset: -0.5px;
			transition: outline-width 0.25s ease, outline-offset 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
		}

		button:not(:has(.selected)):hover {
			outline-width: 5.25px;
		}

		button:has(.selected) {
			transition: outline-width 0.25s ease, outline-offset 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
			outline-offset: 2.75px;
		}

		.selected {
			user-select: none;
			-webkit-user-select: none;
		}
	`;

	const options = [undefined, "orange", "yellow", "green", "blue", "purple"];
	return (
		<div>
			{options.map((option) => (
				<button
					key={option}
					// @ts-ignore i hate you typescript
					on:click={() => (store.accentColor = option)}
					class={use`${store.theme} ${option}`}
					// @ts-ignore is there really no way to ignore a whole scope
					title={option?.charAt(0).toUpperCase() + option?.slice(1) || "Red"}
				>
					{$if(
						use(store.accentColor, (c) => c == option),
						<div class="selected">✓</div>
					)}
				</button>
			))}
		</div>
	);
};
