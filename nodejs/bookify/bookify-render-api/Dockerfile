FROM public.ecr.aws/lambda/nodejs:24

COPY package*.json ./

# Copy built application
COPY ./dist ./dist

# Set the CMD to your handler
CMD [ "dist/render-html.handler" ]
