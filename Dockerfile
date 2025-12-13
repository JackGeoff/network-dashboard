FROM php:8.3-apache

# Install SNMP, ping, traceroute
RUN apt-get update && apt-get install -y \
    libsnmp-dev \
    iputils-ping \
    traceroute \
    && docker-php-ext-install snmp \
    && rm -rf /var/lib/apt/lists/*

# Disable PHP error display
RUN echo 'display_errors = Off' > /usr/local/etc/php/conf.d/display_errors.ini

# Copy project files
COPY . /var/www/html/

# Permissions
RUN chown -R www-data:www-data /var/www/html/backend

EXPOSE 80
