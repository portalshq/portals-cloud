/** This application supplies HLS playback and does not configure Reactor. */
export class Reactor {
  constructor() {
    throw new Error('Reactor playback is not configured in the channels application')
  }
}
