/*global module: true, exports: true */

(function (root) {
	"use strict";

	var default_unary_ops = ["-", "!"], // Permissible unary operations
		default_binary_ops = ["+", "-", "*", "/", "%", "&&", "||", "&", "|", "<<", ">>", "===", "==", "!==", "!=", ">=", "<=",  "<", ">"], //Permissible binary operations
		default_keywords = ["true", "false", "this"],
		extend = function(base_obj, extension_obj) {
			for (var prop in extension_obj) {
				if(extension_obj.hasOwnProperty(prop)) {
					base_obj[prop] = extension_obj[prop];
				}
			}
			return base_obj;
		},
		ltrim_regex = /^\s+/,
		ltrim = function (str) {
			//Trim the left hand side of a string
			return str.replace(ltrim_regex, '');
		},
		COMPOUND = "Compound",
		IDENTIFIER = "Identifier",
		MEMBER_EXP = "MemberExpression",
		LITERAL = "Literal",
		THIS_EXP = "ThisExpression",
		CALL_EXP = "CallExpression",
		UNARY_EXP = "UnaryExpression",
		BINARY_EXP = "BinaryExpression";

	var Parser = function (expr, options) {
		this.expr = expr;
		this.options = extend({
									unary_ops: default_unary_ops,
									binary_ops: default_binary_ops,
									keywords: default_keywords
								}, options);
		this.buffer = this.expr;
		this.curr_node = null;
	};

	(function (my) {
		var proto = my.prototype;
		proto.tokenize = function () {
			var rv = [];
			var last_buffer = this.buffer;
			while (this.buffer) {
				this.gobble_expression();
				if (this.curr_node === false) {
					throw new Error("Unexpected " + this.buffer);
				} else {
					rv.push(this.curr_node);
				}
				if (this.buffer === last_buffer) {
					throw new Error("Could not parse " + this.buffer);
				} else {
					last_buffer = this.buffer;
				}
			}
			if (rv.length === 1) {
				rv = rv[0];
			} else {
				rv = {
					type: COMPOUND,
					body: rv
				};
			}
			return rv;
		};

		proto.gobble_expression = function () {
			var node;
			this.curr_node = null;

			do {
				this.buffer = ltrim(this.buffer);
				node = false;
				if (node === false) {
					node = this.gobble_token();
				}
				if (node === false) {
					node = this.parse_fn_call();
				}
				if (node === false) {
					node = this.parse_parens();
				}
				if (node === false) {
					node = this.parse_binary_op();
				}
				if (node === false) {
					node = this.parse_unary_op();
				}

				if (node) {
					this.curr_node = node;
				} else {
					var separator_node = this.parse_separator();
					if (separator_node) {
						break;
					}
				}
			} while (node);


			return this.curr_node;
		};

		proto.gobble_token = function () {
			var node = false;
			if (node === false) {
				if (this.curr_node === null) {
					node = this.parse_variable();
				}
			}
			if (node === false) {
				node = this.parse_dot_property();
			}
			if (node === false) {
				node = this.parse_square_brackets_property();
			}
			if (node === false) {
				node = this.parse_predef();
			}
			if (node === false) {
				node = this.parse_constant();
			}
			return node;
		};

		var var_regex = new RegExp("^([A-Za-z_$][A-Za-z_$0-9]*)");
		proto.parse_variable = function () {
			var match = this.buffer.match(var_regex);
			if (match) { // We're dealing with a variable name
				var var_name = match[1];
				this.buffer = this.buffer.substr(match[0].length);
				return {
					type: IDENTIFIER,
					name: var_name
				};
			}
			return false;
		};
		proto.parse_dot_property = function () {
			if (this.buffer[0] === ".") {
				if (this.curr_node === null) {
					throw new Error("Unexpected .");
				}

				this.buffer = this.buffer.substr(1);
				var prop_node = this.parse_variable();
				if (prop_node) {
					return {
						type: MEMBER_EXP,
						computed: false,
						object: this.curr_node,
						property: prop_node
					};
				} else {
					throw new Error("Unexpected property '" + this.buffer[0] + "'");
				}
			}
			return false;
		};
		var open_square_brackets_regex = new RegExp("^\\[");
		var close_square_brackets_regex = new RegExp("^\\]");
		proto.parse_square_brackets_property = function () {
			var buffers = [];
			var match = this.buffer.match(open_square_brackets_regex);
			if (match) {// We're dealing with square brackets
				buffers.push(this.buffer);
				this.buffer = this.buffer.substr(match[0].length); // Kill the open bracket
				buffers.push(this.buffer);
				var old_curr_node = this.curr_node;
				this.curr_node = null;
				var contents = this.gobble_expression();
				if (contents) {
					match = this.buffer.match(close_square_brackets_regex);
					if (match) {
						buffers.push(this.buffer);
						this.buffer = this.buffer.substr(match[0].length); // Kill the close bracket
						buffers.push(this.buffer);

						var outer_text = buffers[0].substring(0, buffers[0].length - buffers[3].length);
						var inner_text = buffers[1].substring(0, buffers[1].length - buffers[2].length);
						var node = {
							type: MEMBER_EXP,
							computed: true,
							object: old_curr_node,
							property: contents
						};
						return node;
					} else {
						throw new Error("Unclosed [");
					}
				} else {
					throw new Error("Unexpected property '" + match[1] + "'");
				}
			}
			return false;
		};

		proto.parse_predef = function () {
			var match, i, len;
			for (i = 0, len = this.options.keywords.length; i<len; i++) {
				var constant = this.options.keywords[i];
				var regex = new RegExp("^("+constant+")[^a-zA-Z0-9_\\$]");
				match = this.buffer.match(regex);
				if(match) {
					this.buffer = this.buffer.substr(match[0].length);
					if(match[0] === "this") {
						return {
							type: THIS_EXP
						};
					} else {
						return {
							type: LITERAL,
							value: match[0] === "true",
							raw: match[0]
						};
					}
				}
			}
			return false;
		};

		var start_str_regex = new RegExp("^['\"]");
		var number_regex = new RegExp("^(\\d+(\\.\\d+)?)");
		proto.parse_constant = function () {
			var match, node;
			match = this.buffer.match(number_regex);
			if (match) {
				this.buffer = this.buffer.substr(match[0].length);
				node = {
					type: LITERAL,
					value: parseFloat(match[1]),
					raw: match[0]
				};
				return node;
			} else {
				match = this.buffer.match(start_str_regex);
				if (match) {
					var quote_type = match[0];
					var matching_quote_index = this.buffer.indexOf(quote_type, quote_type.length);

					if (matching_quote_index >= 0) {
						var content = this.buffer.substring(1, matching_quote_index);
						node = {
							type: LITERAL,
							value: content,
							raw: this.buffer.substring(0, matching_quote_index + 1)
						};
						this.buffer = this.buffer.substr(matching_quote_index + 1);
						return node;
					} else {
						throw new Error("Unclosed quote in " + match[0]);
					}
				}
			}
			return false;
		};
		var open_paren_regex = new RegExp("^\\(");
		var fn_arg_regex = new RegExp("^\\s*,");
		var close_paren_regex = new RegExp("^\\s*\\)");
		proto.parse_fn_call = function () {
			if (this.curr_node && (this.curr_node.type === "prop" || this.curr_node.type === "var" || this.curr_node.type === "fn_call")) {
				var match = this.buffer.match(open_paren_regex);
				if (match) {
					var arg_node = false;
					this.buffer = this.buffer.substr(match[0].length); // Kill the open paren
					var args = [];
					var old_curr_node = this.curr_node;
					do {
						this.curr_node = null;
						arg_node = this.gobble_expression();
						args.push(arg_node);
						match = this.buffer.match(fn_arg_regex);
						if (match) {
							this.buffer = this.buffer.substr(match[0].length);
						} else {
							match = this.buffer.match(close_paren_regex);
							if (match) {
								this.buffer = this.buffer.substr(match[0].length);
								break;
							}
						}
					} while (arg_node);
					//this.curr_node = old_curr_node;
					var node = {
						type: CALL_EXP,
						"arguments": args,
						callee: old_curr_node
					};
					return node;
				}
			}
			return false;
		};

		var starts_with = function (str, substr) {
			return str.substr(0, substr.length) === substr;
		};

		proto.parse_parens = function () {
			var match = this.buffer.match(open_paren_regex);

			if (match) {
				this.buffer = this.buffer.substr(match[0].length);
				var previous_node = this.curr_node;
				this.curr_node = null;
				var contents = this.gobble_expression();
				match = this.buffer.match(close_paren_regex);
				if (match) {
					this.buffer = this.buffer.substr(match[0].length);
					return contents;
				} else {
					throw new Error("Unclosed (");
				}
			}
			return false;
		};
		proto.parse_unary_op = function () {
			var i, leni;
			for (i = 0, leni = this.options.unary_ops.length; i < leni; i += 1) {
				var unary_op = this.options.unary_ops[i];
				if (starts_with(this.buffer, unary_op)) {
					this.buffer = this.buffer.substr(unary_op.length);
					var operand = this.gobble_expression();

					var node = {
						type: UNARY_EXP,
						operator: unary_op,
						prefix: true,
						argument: operand
					};
					return node;
				}
			}
			return false;
		};
		proto.parse_binary_op = function () {
			if (this.curr_node !== null) {
				var i, len;
				for (i = 0, len = this.options.binary_ops.length; i < len; i += 1) {
					var binary_op = this.options.binary_ops[i];
					if (starts_with(this.buffer, binary_op)) {
						this.buffer = this.buffer.substr(binary_op.length);
						var operand_1 = this.curr_node;
						this.curr_node = null;
						var operand_2 = this.gobble_expression();

						var node = {
							type: BINARY_EXP,
							operator: binary_op,
							left: operand_1,
							right: operand_2
						};
						return node;
					}
				}
			}
			return false;
		};
		var separator_regex = new RegExp("^[;,]");
		proto.parse_separator = function () {
			var match = this.buffer.match(separator_regex);
			if (match) {
				this.buffer = this.buffer.substr(match[0].length);
				var node = {
					type: "separator",
					separator: match[0]
				};
				return node;
			}
			return false;
		};
	}(Parser));

	var do_parse = function (expr, options) {
		var parser = new Parser(expr, options);
		return parser.tokenize();
	};
	do_parse.version = "<%= version %>";

	function binaryPrecedence(op_val) {
		var prec = 0;
		switch (op_val) {
			case '||':
				prec = 1; break;

			case '&&':
				prec = 2; break;

			case '|':
				prec = 3; break;

			case '^':
				prec = 4; break;

			case '&':
				prec = 5; break;

			case '==':
			case '!=':
			case '===':
			case '!==':
				prec = 6; break;

			case '<':
			case '>':
			case '<=':
			case '>=':
				prec = 7; break;

			case '<<':
			case '>>':
			case '>>>':
				prec = 8; break;

			case '+':
			case '-':
				prec = 9; break;

			case '*':
			case '/':
			case '%':
				prec = 11; break;

			default:
				break;
		}

		return prec;
	}

	if (typeof exports !== 'undefined') {
		if (typeof module !== 'undefined' && module.exports) {
			exports = module.exports = do_parse;
		}
		exports.do_parse = do_parse;
	} else {
		var old_jsep = root.jsep;
		root.jsep = do_parse;
		do_parse.noConflict = function() {
			var jsep = root.jsep;
			root.jsep = old_jsep;
			return jsep;
		};
	}
}(this));
