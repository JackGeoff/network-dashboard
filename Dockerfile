# Use official PHP image with Apache (includes PHP 8.3 and Apache server)
FROM php:8.3-apache

# Install SNMP extension and required tools for ping/traceroute
RUN apt-get update && apt-get install -y libsnmp-dev iputils-ping traceroute \
    && docker-php-ext-install snmp

# Disable display_errors to prevent HTML output in responses
RUN echo 'display_errors = Off' > /usr/local/etc/php/conf.d/display_errors.ini

# Copy all project files to Apache's document root
COPY . /var/www/html/

# Make devices.json writable by the web server user
RUN chown -R www-data:www-data /var/www/html/backend

# Expose port 80 for web traffic
EXPOSE 80

# Start Apache (default CMD from base image)
