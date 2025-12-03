import castArray from 'lodash-es/castArray.js'
import { observable, reaction, runInAction, type IReactionDisposer } from 'mobx'

export interface SerializableState<T extends object = object> {
  /**
   * Stable ID of this serialized object.
   */
  readonly id: string

  /**
   * Given a JSON representation of this object, rehydrate it. For proper observability, this should access all
   * observable properties of the entity.
   */
  fromJSON(json: T): void

  /**
   * Converts this state into its serialized form.
   */
  toJSON(): T
}

/**
 * Class constructor type for serializable objects.
 */
export type SerializableConstructor<T extends SerializableState = SerializableState> = new (id?: string) => T

export type SerializedForm<T extends SerializableConstructor> = Parameters<InstanceType<T>['fromJSON']>[0]

/**
 * Options used to configure a data store.
 */
export interface StoreOptions<T extends SerializableState = SerializableState> {
  /**
   * Callback invoked whenever a managed entity is updated.
   */
  onChanged?: (entity: T) => void | Promise<void>

  /**
   * Callback invoked whenever a managed entity is created.
   */
  onCreated?: (entity: T) => void | Promise<void>

  /**
   * Callback invoked whenever a managed entity is deleted.
   */
  onDeleted?: (entity: T) => void | Promise<void>
}

export abstract class AbstractStore<
  C extends SerializableConstructor = SerializableConstructor,
  T extends InstanceType<C> = InstanceType<C>,
> {
  /**
   * Map of all items managed by this store, keyed by the item ID.
   */
  private _items: Map<string, T> = observable.map(new Map<string, T>())

  /**
   * Flag indicating if we are performing a bulk load operation. Callbacks are disabled during this time.
   */
  private _isLoading = false

  /**
   * Callback invoked whenever an item is changed.
   */
  private _onChanged?: (record: T) => void | Promise<void>

  /**
   * Callback invoked whenever an item is created.
   */
  private _onCreated?: (record: T) => void | Promise<void>

  /**
   * Callback invoked whenever an item is deleted.
   */
  private _onDeleted?: (record: T) => void | Promise<void>

  /**
   * Map associating entity IDs with the disposal handle for its reaction. If an object is removed from memory, this
   * handle should be disposed to prevent memroy leaks.
   */
  private _reactionDisposers: Map<string, IReactionDisposer> = new Map<string, IReactionDisposer>()

  public constructor(
    private ConstructorFn: C,
    options: StoreOptions<T> = {},
  ) {
    this._onChanged = options.onChanged
    this._onCreated = options.onCreated
    this._onDeleted = options.onDeleted
  }

  /**
   * Creates a new instance of the entity type managed by this store. The newly created instance will be setup
   * as an Observable. The onCreate callback (if any) will be invoked, and onChange will be invoked as needed.
   *
   * @param initializer a function used to set initial values for the entitie
   * @returns The new entity
   */
  public create(initializer?: (entity: T) => void): T {
    const result = new this.ConstructorFn() as T
    runInAction(() => {
      initializer?.(result)

      this._initializeObservable(result)

      if (!this._isLoading) {
        void this._onCreated?.(result)
      }

      this._items.set(result.id, result)
    })

    return result
  }

  /**
   * Removes an item from the store. The item can be passed directly, or else the ID of an item to remove can be passed.
   * If there is no such item, this function is a noop. Will invoke any registered `onDelete` handler.
   */
  public delete(idOrItem: string | T): void {
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.id
    const item = this._items.get(id)

    if (item !== undefined) {
      runInAction(() => {
        this._reactionDisposers.get(id)?.()
        this._items.delete(id)
        this._reactionDisposers.delete(id)

        void this._onDeleted?.(item)
      })
    }
  }

  /**
   * Retrieves an item from the store by its ID.
   */
  public get(id: string): T | null {
    return this._items.get(id) ?? null
  }

  /**
   * Retrieves all items from the store.
   */
  public list(): T[] {
    return [...this._items.values()]
  }

  /**
   * Loads all of the supplied serialized items into this store. Existing items will be updated from the JSON
   * content, and new ones will be inserted. `onCreated` and `onChanged` handlers are not called during this operation.
   * @param itemOrItems
   */
  public load(itemOrItems: SerializedForm<C> | SerializedForm<C>[]): void {
    const items = castArray(itemOrItems)
    this._isLoading = true
    runInAction(() => {
      items.forEach((json) => {
        this._loadOne(json)
      })
      this._isLoading = false
    })
  }

  private _initializeObservable(root: T) {
    const disposer = reaction(
      () => root.toJSON(),
      () => {
        if (!this._isLoading) {
          void this._onChanged?.(root)
        }
      },
    )
    this._reactionDisposers.set(root.id, disposer)
  }

  /**
   * Load one serialized entity into the store. If the store already has an object with the ID, it's updated via the
   * item's "fromJSON" function. Otherwise, a new entity is created, hydrated, and added to the store.
   */
  private _loadOne(json: SerializedForm<C>): void {
    const id = (json as SerializableState).id
    let item = this.get(id)
    if (item === null) {
      item = new this.ConstructorFn(id) as T
      this._initializeObservable(item)
      this._items.set(id, item)
    }

    item.fromJSON(json)
  }
}
