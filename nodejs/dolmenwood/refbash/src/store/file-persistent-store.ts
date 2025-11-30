import fs from 'node:fs'
import path from 'node:path'
import { AbstractStore, type SerializableConstructor, type SerializableState } from './abstract-store.js'

export class FilePersistentStore<C extends SerializableConstructor = SerializableConstructor> extends AbstractStore<C> {
  public constructor(
    constructorType: C,
    private _filePath: string,
  ) {
    super(constructorType, {
      onChanged: (record) => {
        this._saveOne(record)
      },
      onCreated: (record) => {
        this._saveOne(record)
      },
    })

    fs.mkdirSync(path.resolve('.data', _filePath), { recursive: true })
    this.load()
  }

  public load() {
    const dirPath = path.resolve('.data', this._filePath)

    // Return early if directory doesn't exist
    if (!fs.existsSync(dirPath)) {
      return
    }

    // Read all JSON files from the directory
    const files = fs.readdirSync(dirPath).filter((file) => file.endsWith('.json'))

    // Parse each file and collect the JSON objects
    const jsonObjects = files.map((file) => {
      const filePath = path.join(dirPath, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as ReturnType<InstanceType<C>['toJSON']>
    })

    // Load all objects into the store
    if (jsonObjects.length > 0) {
      super.load(jsonObjects)
    }
  }

  public save() {
    const items = this.list()

    // Write each item to its own JSON file
    items.forEach((item) => {
      const json = item.toJSON()
      const filePath = path.resolve('.data', this._filePath, `${item.id}.json`)
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8')
    })
  }

  private _saveOne(record: SerializableState): void {
    fs.writeFileSync(
      path.resolve('.data', this._filePath, `${record.id}.json`),
      JSON.stringify(record, null, 2),
      'utf-8',
    )
  }
}
