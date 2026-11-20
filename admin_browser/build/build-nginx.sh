#!/bin/sh
set -eu
cd /build
sha512sum -c <<'CHECKSUMS'
c88979d6c4da0942110b2b78a5d1a4c62a3f1d943ec0a430f17df8f5d23c32620af44dc53569aac4f4fdd76a7a019dc97d7f994b87203ec35eafc9af8bc78555  nginx-1.30.7.tar.gz
d923db9f2d09e814d683b9376d6a25e0cdf9c3234c3cfbe371df48b5aa4cd36a74677543453e1ee7a1c8d07c532a1cacf4638f44cad64d9a7d15a033912bcd20  websockify-nginx-module-0.0.3.tar.gz
CHECKSUMS
tar xzf nginx-1.30.7.tar.gz
tar xzf websockify-nginx-module-0.0.3.tar.gz
cd nginx-1.30.7
# Dynamic OpenSSL/PCRE libraries receive Alpine security updates. HTTP/2, HTTP/3
# and mail are deliberately not built. Retain the existing noVNC WS bridge.
./configure --prefix=/var/lib/nginx --sbin-path=/opt/base/sbin/nginx \
  --conf-path=/opt/base/etc/nginx/nginx.conf --pid-path=/var/run/nginx/nginx.pid \
  --error-log-path=/config/log/nginx/error.log --http-log-path=/config/log/nginx/access.log \
  --http-client-body-temp-path=/var/tmp/nginx/client_body --http-proxy-temp-path=/var/tmp/nginx/proxy \
  --user=app --group=app --with-threads --with-file-aio --with-http_ssl_module \
  --with-http_sub_module --with-http_auth_request_module --with-pcre-jit \
  --with-stream --with-stream_ssl_module --without-http_gzip_module \
  --without-http_fastcgi_module --without-http_uwsgi_module --without-http_scgi_module \
  --with-cc-opt='-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE' \
  --with-ld-opt='-Wl,-z,relro,-z,now -pie' \
  --add-module=/build/websockify-nginx-module-0.0.3
make -j4
strip objs/nginx
mkdir /out
cp objs/nginx /out/nginx
