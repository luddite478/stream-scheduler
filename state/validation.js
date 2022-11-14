const Ajv = require("ajv")
const ajv = new Ajv()

const schema = {
  type: "object",
  properties: {
    pages: {type: "array"}
  },
  required: ["pages"],
  additionalProperties: true
}

const is_valid_state = ajv.compile(schema)

module.exports = { 
	is_valid_state
}