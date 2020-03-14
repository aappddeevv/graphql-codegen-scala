import make from "debug";

export const log = make("scala");
export const createLogger = (name: string) => log.extend(name);
export default createLogger;
