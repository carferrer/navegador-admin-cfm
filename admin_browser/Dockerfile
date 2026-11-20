FROM golang:1.27.4-alpine3.24@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS services-build
WORKDIR /src
COPY build/webservices/ ./
RUN go mod verify && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/webservices .
WORKDIR /auth
COPY build/webauth/ ./
RUN go mod verify && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/webauth .

FROM jlesage/firefox:v26.11.1@sha256:9b6f819004868a74a14fb1d82f4b2655a316cc99cf58c60bf41cbdb84bf8a08f AS nginx-build
USER 0
RUN apk upgrade --no-cache && apk add --no-cache build-base linux-headers openssl-dev pcre2-dev libseccomp-dev
COPY build/build-nginx.sh build/*.tar.gz /build/
RUN sh /build/build-nginx.sh
COPY build/secure-launch.c /build/
RUN cc -O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE -pie -Wl,-z,relro,-z,now \
       /build/secure-launch.c -lseccomp -o /out/secure-launch

FROM jlesage/firefox:v26.11.1@sha256:9b6f819004868a74a14fb1d82f4b2655a316cc99cf58c60bf41cbdb84bf8a08f

USER 0
RUN apk del firefox \
    && apk upgrade --no-cache \
    && apk add --no-cache nodejs pcre2 libseccomp firefox-esr=153.7.0-r0 \
       tigervnc openbox dbus xkbcomp xrdb yad \
    && for bin in Xvnc vncpasswd openbox obxprop dbus-daemon xkbcomp xrdb yad; do \
         test -x /usr/bin/$bin && ln -sf /usr/bin/$bin /opt/base/bin/$bin; done \
    && rm -rf /opt/base/lib \
    && test -x /usr/bin/firefox-esr \
    && ln -sf /usr/bin/firefox-esr /usr/bin/firefox \
    && set-cont-env APP_VERSION 153.7.0esr-r0 \
    && mkdir -p /opt/cfm /etc/firefox/policies \
    && sed -i '/^server {/i include /opt/cfm/access-map.conf;' /opt/base/etc/nginx/default_site.conf \
    && sed -i '/^server {/a\    include /opt/cfm/access-server.conf;' /opt/base/etc/nginx/default_site.conf \
    && sed -i 's/add_header Cache-Control no-cache;/add_header Cache-Control "no-store" always;/' /opt/base/etc/nginx/default_site.conf \
    && sed -i 's@access_log /config/log/nginx/access.log main;@access_log off;@' /opt/base/etc/nginx/nginx.conf
COPY --from=nginx-build /out/nginx /opt/base/sbin/nginx
COPY --from=services-build /out/webservices /opt/base/bin/webservices
COPY --from=services-build /out/webauth /opt/base/bin/webauth
COPY --from=nginx-build /out/secure-launch /opt/cfm/secure-launch
COPY rootfs/ /
RUN chmod 755 /opt/cfm/entrypoint.sh /etc/services.d/xvnc/params
ENV USER_ID=1000 GROUP_ID=1000 UMASK=0077 \
    WEB_LISTENING_PORT=5800 VNC_LISTENING_PORT=-1 \
    WEB_TERMINAL=0 WEB_AUDIO=0 WEB_NOTIFICATION=0 WEB_AUTHENTICATION=0 \
    WEB_FILE_MANAGER=1 WEB_FILE_MANAGER_ALLOWED_PATHS=/data/exchange \
    WEB_FILE_MANAGER_DENIED_PATHS=/data/profile,/data/profile-esr,/config,/etc \
    SECURE_CONNECTION=0 KEEP_APP_RUNNING=1 \
    FF_OPEN_URL=file:///opt/cfm/home.html FF_CUSTOM_ARGS=
ENTRYPOINT ["/opt/cfm/entrypoint.sh"]
