import winston from 'winston';
import path from 'path';
import { env } from '../config/env';

const logDir = path.resolve(__dirname, '../../logs');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const isDev = env.NODE_ENV === 'development';
  return isDev ? 'debug' : 'warn';
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

const transports = [
  new winston.transports.Console({
    format: env.NODE_ENV === 'development' ? devFormat : format,
  }),
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format,
    maxsize: 5242880,
    maxFiles: 5,
  }),
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    format,
    maxsize: 5242880,
    maxFiles: 5,
  }),
];

export const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
});

export default logger;
