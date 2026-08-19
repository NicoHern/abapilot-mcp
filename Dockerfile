FROM node:22-alpine
RUN npm install -g abapilot
# The connector starts without configuration and serves its tool catalog;
# point it at a licensed ABAPilot backend to make the tools live:
#   ABAPILOT_URL=http://<sap-host>:<port>/sap/bc/ZABAPilot
CMD ["abapilot"]
