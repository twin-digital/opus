import { ExtStateStore } from './ext-state.js'
import { SimProject } from './project.js'

/**
 * REAPER's state as scripts and the web remote see it. There is always a current project.
 */
export class ReaperModel {
  readonly globalExtState = new ExtStateStore(false)
  /**
   * Names of the audio device's input channels, as `GetInputChannelName` reports them.
   */
  audioInputs: string[] = ['Input 1', 'Input 2']
  readonly projects: SimProject[] = [new SimProject()]
  private current: SimProject = this.projects[0]

  get currentProject(): SimProject {
    return this.current
  }

  /**
   * Opens a project in a new tab and makes it current.
   */
  openProject(path = ''): SimProject {
    const project = new SimProject(path)
    this.projects.push(project)
    this.current = project
    return project
  }

  /**
   * Opens a project in the current tab, replacing the project there, as `Main_openProject` does.
   * The tab keeps its handle.
   */
  openProjectInTab(path = ''): SimProject {
    this.current.open(path)
    return this.current
  }

  selectProject(project: SimProject): void {
    if (!this.projects.includes(project)) {
      throw new Error('Project is not open')
    }
    this.current = project
  }

  /**
   * Closes a project; closing the last one leaves a new unsaved project, as REAPER does.
   */
  closeProject(project: SimProject): void {
    const index = this.projects.indexOf(project)
    if (index < 0) {
      throw new Error('Project is not open')
    }
    this.projects.splice(index, 1)
    if (this.projects.length === 0) {
      this.projects.push(new SimProject())
    }
    if (this.current === project) {
      this.current = this.projects[Math.min(index, this.projects.length - 1)]
    }
  }
}
