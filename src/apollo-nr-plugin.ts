import newrelic from 'newrelic';
import { ApolloServerPlugin, GraphQLRequestListener } from 'apollo-server-plugin-base';
import { GraphQLRequestContext, BaseContext } from 'apollo-server-types';

export const NewRelicApolloTransactionWrapPlugin: ApolloServerPlugin = {
    requestDidStart(requestContext: GraphQLRequestContext): GraphQLRequestListener<BaseContext> {
        return newrelic.startWebTransaction(requestContext.request.operationName || '/graphql/unknown', (_handle) => {
            return {
                willSendResponse() {
                    newrelic.endTransaction();
                },
    
                didEncounterErrors() {
                    newrelic.endTransaction();
                }
            }
        })
    }
}
