export const TextField: Component<
	{
		"on:keydown"?: (() => void) | ((e: KeyboardEvent) => void);
		"on:input"?: (() => void) | ((e: InputEvent) => void);
		value: string;
		placeholder?: string;
		class?: string;
		type?: string;
		disabled?: boolean;
		maxlength?: number;
	},
	{}
> = function () {
	this.css = `
    border: 0.1rem solid var(--surface1);
    border-radius: 4rem;
    background: var(--bg-sub);
    padding: 0.5em;
    font-family: var(--font-body);
    padding-left: 0.75rem;
    transition: all 0.1s ease;

    &:hover {
      transition: all 0.1s ease;
      border-color: var(--surface2);
    }

    &:focus {
      transition: all 0.1s ease;
      border-color: var(--accent);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      border-color: var(--surface1);
    }

    ::placeholder {
      color: var(--surface5);
    }
  `;

	return (
		<input
			type={this.type || "text"}
			class={`component-textfield ${this.class}`}
			placeholder={`${this.placeholder}`}
			bind:value={use(this.value)}
			on:keydown={this["on:keydown"] || (() => {})}
			on:input={this["on:input"] || (() => {})}
			disabled={use(this.disabled)}
			maxlength={this.maxlength}
		/>
	);
};
