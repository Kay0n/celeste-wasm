import type { IconifyIcon } from "@iconify/types";

export const Button: Component<
	{
		"on:click": (() => void) | ((e: PointerEvent) => void);

		class?: string;
		type: "primary" | "normal" | "listitem" | "listaction";
		icon: "full" | "left" | "none";
		disabled: boolean;
		title?: string;
	},
	{
		children: any;
	}
> = function () {
	// @ts-expect-error
	this._leak = true;
	const transition =
		"background 0.15s, color 0.15s, transform 0.15s, border-color 0.15s, border 0.15s, border-bottom 0.15s";
	this.css = `
		button {
			display: flex;
			align-items: center;
			justify-content: center;

			width: 100%;
			height: 100%;

			border: none;
			border-radius: 20rem;
			padding: 0.5rem;
			font-family: var(--font-body);
			cursor: pointer;
		}

		button,button:hover,button:focus,button:active,button:disabled {
			transition: ${transition};
		}

		button:not(:disabled, .type-listitem) {
		  --border-color: color-mix(in srgb, var(--fg) 10.5%, transparent);
		  box-shadow: inset 0px -0.85px 1px 0px var(--border-color);
		}

		button, button:active {
			transition: transform 0.1s;
			-webkit-user-select: none;
			user-select: none;
			transform-origin: 50% 100%;
			perspective: 1250px;
		}

		button:not(.type-listitem) {
			padding-bottom: 0.5rem;
		}

		button:not(:disabled):hover {
			transform: rotate3d(1, 0, 0, 7.5deg);
		}

		button:not(:disabled):active {
			transform: rotate3d(1, 0, 0, 17.5deg);
		}

		button.icon-full svg, button.icon-left svg {
			width: 1.5rem;
			height: 1.5rem;
		}
		button.icon-full {
			border-radius: 4rem;
		}
		button.icon-left {
			gap: 0.25rem;
		}

		button.type-primary {
			background: var(--accent);
			color: var(--fg);
			--border-color: color-mix(in srgb, var(--accent) 55%, var(--fg));
			transition: ${transition};
		}
		button.type-normal {
			background: var(--surface1);
			color: var(--fg);
			transition: ${transition};
		}
		button.type-listitem {
			background: transparent;
			color: var(--fg);
			border-radius: 0.85rem;
			transition-duration: 0.1s;
			padding-block: 0.75rem;
			padding-inline: 0.5rem;
			border: none;
			  transition: ${transition};
			&:hover {
				transition-duration: 0.1s;
			}
		}
		button.type-listaction {
			background: var(--surface1);
			color: var(--fg);
			transition: ${transition};
		}

		button.type-primary:not(:disabled):hover {
			background: color-mix(in srgb, var(--accent) 80%, white);
			transition: ${transition};
		}
		button.type-primary:not(:disabled):active {
			background: color-mix(in srgb, var(--accent) 70%, white);
			transition: ${transition};
		}
		button.type-normal:not(:disabled):hover {
			background: var(--surface3);
			border-color: color-mix(in srgb, var(--surface4) 60%, var(--surface3));
      transition: ${transition};
		}
		button.type-normal:not(:disabled):active {
			background: var(--surface4);
			border-color: color-mix(in srgb, var(--surface5) 80%, var(--surface4));
      transition: ${transition};
		}
		button.type-listitem:not(:disabled):hover {
			background: var(--surface0);
      transition: ${transition};
		}
		button.type-listitem:not(:disabled):active {
			background: var(--surface1);
      transition: ${transition};
		}
		button.type-listaction:not(:disabled):hover {
			background: var(--surface2);
			border-color: color-mix(in srgb, var(--surface3) 80%, var(--surface2));
      transition: ${transition};
		}
		button.type-listaction:not(:disabled):active {
			background: var(--surface3);
			border-color: color-mix(in srgb, var(--surface4) 80%, var(--surface3));
      transition: ${transition};
		}

		button:disabled {
			background: var(--surface0);
			color: var(--surface6);
			cursor: not-allowed;
			border-color: transparent;
			transition: ${transition};
			// border-color: color-mix(in srgb, var(--surface0) 98%, var(--fg));
		}
	`;
	return (
		<div class="component-btn">
			<button
				on:click={this["on:click"]}
				class={`icon-${this.icon} type-${this.type} ${this.class}`}
				disabled={use(this.disabled)}
				title={use(this.title)}
			>
				{use(this.children)}
			</button>
		</div>
	);
};

export const Icon: Component<{ icon: IconifyIcon; class?: string }, {}> =
	function () {
		// @ts-expect-error
		this._leak = true;
		this.mount = () => {
			this.root.innerHTML = this.icon.body;
			useChange([this.icon], () => {
				this.root.innerHTML = this.icon.body;
			});
		};
		return (
			<svg
				width="1em"
				height="1em"
				viewBox={use`0 0 ${this.icon.width} ${this.icon.height}`}
				xmlns="http://www.w3.org/2000/svg"
				class={`component-icon ${this.class}`}
			></svg>
		);
	};
