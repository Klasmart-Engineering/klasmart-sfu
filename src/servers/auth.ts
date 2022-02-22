import cookie from "cookie";
import {IncomingMessage} from "http";
import {checkAuthenticationToken, checkLiveAuthorizationToken} from "kidsloop-token-validation";
import parseUrl from "parseurl";
import {Url} from "url";
import {Logger} from "../logger";
import {newRoomId} from "../v2/room";
import {JsonWebTokenError, NotBeforeError, TokenExpiredError} from "jsonwebtoken";

/// Wraps an error from the token validation library.
abstract class AuthError extends Error {
    private static getErrorCode<T extends Error>(error: T): number {
        enum ErrorCodes {
            INVALID = 4400,
            NOT_BEFORE = 4403,
            EXPIRED = 4401,
            MISMATCH = 4498,
            UNKNOWN_ERROR = 4500,
        }

        let code: number;
        switch (error.constructor) {
        case MissingAuthError:
        case JsonWebTokenError:
            code = ErrorCodes.INVALID;
            break;
        case NotBeforeError:
            code = ErrorCodes.NOT_BEFORE;
            break;
        case TokenExpiredError:
            code = ErrorCodes.EXPIRED;
            break;
        case MismatchError:
            code = ErrorCodes.MISMATCH;
            break;
        default:
            code = ErrorCodes.UNKNOWN_ERROR;
            break;
        }
        return code;
    }
    public readonly code: number;
    protected constructor(inner: Error) {
        super(inner.message);
        this.code = AuthError.getErrorCode(inner);
    }
}

export class AuthenticationError extends AuthError {
    name = "AuthenticationError";
    constructor(public readonly inner: Error) {
        super(inner);
    }
}

export class AuthorizationError extends AuthError {
    name = "AuthorizationError";
    constructor(public readonly inner: Error) {
        super(inner);
    }
}

export class TokenMismatchError extends AuthError {

    name = "TokenMismatchError";
    constructor(message: string) {
        super(new MismatchError(message));
    }
}

export class MissingAuthenticationError extends AuthError {
    name = "MissingAuthenticationError";
    constructor(message: string) {
        super(new MissingAuthError(message));
    }
}

export class MissingAuthorizationError extends AuthError {
    name = "MissingAuthorizationError";
    constructor(message: string) {
        super(new MissingAuthError(message));
    }
}

class MissingAuthError extends Error {
    name = "MissingAuthError";
    constructor(message: string) {
        super(message);
    }
}

class MismatchError extends Error {
    name = "MismatchError";
    constructor(message: string) {
        super(message);
    }
}

export type AuthErrors = AuthenticationError | AuthorizationError | TokenMismatchError | MissingAuthenticationError | MissingAuthorizationError;

export function decodeAuthError<T extends Error>(error: T): AuthErrors {
    switch (error.constructor) {
    case MissingAuthenticationError:
        return error as unknown as MissingAuthenticationError;
    case MissingAuthorizationError:
        return error as unknown as MissingAuthorizationError;
    case TokenMismatchError:
        return error as unknown as TokenMismatchError;
    case AuthenticationError:
        return error as unknown as AuthenticationError;
    case AuthorizationError:
        return error as unknown as AuthorizationError;
    default:
        throw error;
    }
}

export async function handleAuth(req: IncomingMessage, url = parseUrl(req)) {
    if (process.env.DISABLE_AUTH) {
        Logger.warn("RUNNING IN DEBUG MODE - SKIPPING AUTHENTICATION AND AUTHORIZATION");
        return {
            userId: debugUserId(),
            roomId: newRoomId("test-room"),
            isTeacher: true
        };
    }

    const authentication = getAuthenticationJwt(req, url);
    const authorization = getAuthorizationJwt(req, url);

    let authenticationToken;
    try {
        authenticationToken = await checkAuthenticationToken(authentication);
    } catch (error) {
        throw new AuthenticationError(<Error> error);
    }

    let authorizationToken;
    try {
        authorizationToken = await checkLiveAuthorizationToken(authorization);
    } catch (error) {
        throw new AuthorizationError(<Error> error);
    }
    if (authorizationToken.userid !== authenticationToken.id) {
        throw new TokenMismatchError("Authentication and Authorization tokens are not for the same user");
    }

    return {
        userId: authorizationToken.userid,
        roomId: newRoomId(authorizationToken.roomid),
        isTeacher: authorizationToken.teacher ?? false,
    };
}

function getAuthenticationJwt (req: IncomingMessage, url?: Url) {
    if(url && process.env.NODE_ENV?.toLowerCase().startsWith("dev")) {
        const authentication =  getFromUrl(url, "authentication");
        if(authentication) { return authentication; }
    }

    if (req.headers.cookie) {
        const cookies = cookie.parse(req.headers.cookie);
        const authentication = cookies.access;
        if(authentication) { return authentication; }
    }

    throw new MissingAuthenticationError("No authentication");
}

function getAuthorizationJwt (_req: IncomingMessage, url?: Url) {
    if(url) {
        const authorization =  getFromUrl(url, "authorization");
        if(authorization) { return authorization; }

    }
    throw new MissingAuthorizationError("No authorization; no authorization query param");
}


function getFromUrl(url: Url, key: string) {
    if (!url.query) { return; }
    if (typeof url.query === "string") {
        const queryParams = new URLSearchParams(url.query);
        const value = queryParams.get(key);
        return value ?? undefined;
    } else {
        const value = url.query[key];
        return value instanceof Array ? value[0] : value;
    }
}

let _debugUserCount = 0;
function debugUserId() { return `debugUser${_debugUserCount++}`; }
