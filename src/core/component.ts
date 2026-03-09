export abstract class Component<T = any> {
    protected container: HTMLElement;
    protected state: T;

    constructor(container: HTMLElement, initialState: T) {
        this.container = container;
        this.state = initialState;
    }

    /**
     * Updates the component state and triggers a re-render.
     */
    public setState(newState: Partial<T>) {
        this.state = { ...this.state, ...newState };
        this.render();
    }

    /**
     * Renders the component into the container.
     */
    public abstract render(): void;

    /**
     * Lifecycle hook called after the component is first mounted to the DOM.
     */
    protected onMount?(): void;

    /**
     * Lifecycle hook called after every render updates the DOM.
     */
    protected onUpdate?(): void;

    /**
     * Lifecycle hook called when the component is removed from the DOM.
     */
    public destroy?(): void;

    /**
     * Helper to clear the container safely.
     */
    protected clear() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }
}
