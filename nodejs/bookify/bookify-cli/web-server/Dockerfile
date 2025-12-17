FROM nginx:alpine

# Copy custom nginx configuration
COPY web-server/nginx.conf /etc/nginx/nginx.conf

# Copy initial dist files (will be overlayed by watch sync)
COPY .bookify/dist /srv/www

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
