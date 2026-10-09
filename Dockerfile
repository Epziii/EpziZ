FROM quay.io/m3110w/mellowmd:latest

WORKDIR /root/EpziZ

RUN git clone https://github.com/Epziii/EpziZ.git . && \
    yarn install --frozen-lockfile

EXPOSE 5000

CMD ["npm", "start"]