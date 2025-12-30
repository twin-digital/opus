import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda'

export const handler = (event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
  console.log('Event:', JSON.stringify(event, null, 2))
  console.log('Context:', JSON.stringify(context, null, 2))

  return Promise.resolve({
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Hello from Bookify!`,
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId,
      path: event.rawPath,
      method: event.requestContext.http.method,
    }),
  })
}
