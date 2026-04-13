import { AuthUser } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
