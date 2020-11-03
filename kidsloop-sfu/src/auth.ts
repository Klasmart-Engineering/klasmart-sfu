import {decode, Secret, verify, VerifyOptions} from "jsonwebtoken"
import {Logger} from "./entry";

const issuers = new Map<
    string,
    {
        options: VerifyOptions,
        secretOrPublicKey: Secret,
    }>([
    [
        "KidsLoopChinaUser-live",
        {
            options: {
                issuer: "KidsLoopChinaUser-live",
                algorithms: ["RS512"],
            },
            secretOrPublicKey: [
                "-----BEGIN PUBLIC KEY-----",
                "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDAGN9KAcc61KBz8EQAH54bFwGK",
                "6PEQNVXXlsObwFd3Zos83bRm+3grzP0pKWniZ6TL/y7ZgFh4OlUMh9qJjIt6Lpz9",
                "l4uDxkgDDrKHn8IrflBxjJKq0OyXqwIYChnFoi/HGjcRtJhi8oTFToSvKMqIeUuL",
                "mWmLA8nXdDnMl7zwoQIDAQAB",
                "-----END PUBLIC KEY-----"
            ].join("\n")
        }
    ],
    [
        "kidsloop",
        {
            options: {
                issuer: "kidsloop",
                algorithms: [ "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "HS256", "HS384", "HS512"]
            },
            secretOrPublicKey: [
                "-----BEGIN PUBLIC KEY-----\n" +
                "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxdHMYTqFobj3oGD/JDYb",
                "DN07icTH/Dj7jBtJSG2clM6hQ1HRLApQUNoqcrcJzA0A7aNqELIJuxMovYAoRtAT",
                "E1pYMWpVyG41inQiJjKFyAkuHsVzL+t2C778BFxlXTC/VWoR6CowWSWJaYlT5fA/",
                "krUew7/+sGW6rjV2lQqxBN3sQsfaDOdN5IGkizsfMpdrETbc5tKksNs6nL6SFRDe",
                "LoS4AH5KI4T0/HC53iLDjgBoka7tJuu3YsOBzxDX22FbYfTFV7MmPyq++8ANbzTL",
                "sgaD2lwWhfWO51cWJnFIPc7gHBq9kMqMK3T2dw0jCHpA4vYEMjsErNSWKjaxF8O/",
                "FwIDAQAB",
                "-----END PUBLIC KEY-----"
            ].join("\n")
        }
    ]
]);

if (process.env.NODE_ENV !== "production") {
    issuers.set("calmid-debug",
        {
            options: {
                issuer: "calmid-debug",
                algorithms: [
                    "HS512",
                    "HS384",
                    "HS256",
                ],
            },
            secretOrPublicKey: "iXtZx1D5AqEB0B9pfn+hRQ==",
        })
}

export type JWT = {
    aud: string,
    exp: number,
    iat: number,
    iss: string,
    sub: string,
    TokenType: number,
    Data: string,
    name: string,
    roomid: string,
    userid: string,
    teacher: boolean
}

export async function checkToken(token?: string): Promise<JWT> {
    try {

        if (!token) {
            Logger.error("Missing JWT Token")
            throw new Error("Missing JWT token")
        }
        const payload = decode(token)
        if (!payload || typeof payload === "string") {
            Logger.error("JWT Payload is incorrect")
            throw new Error("JWT Payload is incorrect")
        }
        const issuer = payload["iss"]
        if (!issuer || typeof issuer !== "string") {
            Logger.error("JWT Issuer is incorrect")
            throw new Error("JWT Issuer is incorrect")
        }
        const issuerOptions = issuers.get(issuer)
        if (!issuerOptions) {
            Logger.error("JWT IssuerOptions are incorrect")
            throw new Error("JWT IssuerOptions are incorrect")
        }
        const userid = payload["userid"]
        if (!userid) {
            Logger.error("JWT is missing userid")
            throw new Error("JWT is missing userid")
        }
        const {options, secretOrPublicKey} = issuerOptions
        return await new Promise((resolve, reject) => {
            verify(token, secretOrPublicKey, options, (err, decoded) => {
                if (err) {
                    reject(err)
                }
                if (decoded) {
                    resolve(<JWT>decoded)
                }
                reject(new Error("Unexpected authorization error"))
            })
        })
    } catch (e) {
        Logger.error(e)
        throw e
    }
}