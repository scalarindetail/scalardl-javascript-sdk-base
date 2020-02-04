const {StatusCode} = require('./status_code');
const {ClientError} = require('./client_error');
const {
  ContractRegistrationRequestBuilder,
  ContractsListingRequestBuilder,
  LedgerValidationRequestBuilder,
  CertificateRegistrationRequestBuilder,
  FunctionRegistrationRequestBuilder,
  ContractExecutionRequestBuilder,
} = require('./request/builder');

const {EllipticSigner, WebCryptoSigner} = require('./signer');

/**
 * This class handles all client interactions including registering certificates
 * and contracts, listing contracts, validating the ledger, and executing
 * contracts.
 * @class
 */
class ClientServiceBase {
  /**
   * @param {Object} services contains the object of ledgeClient and
   *  the object of ledgerPrivileged
   * @param {Protobuf} protobuf protobuf object to inject
   * @param {Object} properties JSON Object used for setting client properties
   */
  constructor(services, protobuf, properties) {
    /** @const */
    this.properties = properties;
    /** @const */
    this.serverHost = properties['scalar.ledger.client.server_host'];
    /** @const */
    this.serverPort = properties['scalar.ledger.client.server_port'];
    /** @const */
    this.tlsEnabled = properties['scalar.ledger.client.tls.enabled'];
    if (this.tlsEnabled !== undefined && typeof this.tlsEnabled !== 'boolean') {
      throw new ClientError(
          StatusCode.CLIENT_IO_ERROR,
          'property \'scalar.ledger.client.tls.enabled\' is not a boolean',
      );
    }
    /** @const */
    this.privateKeyPem = this._getRequiredProperty(properties,
        'scalar.ledger.client.private_key_pem');
    /** @const */
    this.certPem = this._getRequiredProperty(properties,
        'scalar.ledger.client.cert_pem');
    /** @const */
    this.certHolderId = this._getRequiredProperty(properties,
        'scalar.ledger.client.cert_holder_id');
    /** @const */
    this.credential =
      properties['scalar.ledger.client.authorization.credential'];
    /** @const */
    this.certVersion = properties['scalar.ledger.client.cert_version'];

    /** @const */
    this.metadata = {};
    if (this.credential) {
      this.metadata.Authorization = this.credential;
    }

    /** @const */
    if (this._isNodeJsRuntime()) {
      this.signer = new EllipticSigner(this.privateKeyPem);
    } else {
      this.signer = new WebCryptoSigner(this.privateKeyPem);
    }

    /**
     * The LedgerClient generated by gRPC library
     * @constant
     */
    this.ledgerClient = services['ledgerClient'];

    /**
     * The LedgerPrivileged generated by gRPC library
     * @constant
     */
    this.ledgerPrivileged = services['ledgerPrivileged'];

    /**
     * The protobuf message object generated by gRPC library
     * @constant
     */
    this.protobuf = protobuf;
  }

  /**
   * Name of binary status
   * @return {string}
   */
  static get binaryStatusKey() {
    return 'rpc.status-bin';
  }

  /**
   * @param {Object} properties JSON Object used for setting client properties
   * @param {string} name the name of the property to get
   * @return {Object} The client property specified in the @name parameter
   */
  _getRequiredProperty(properties, name) {
    const value = properties[name];
    if (!value) {
      throw new ClientError(
          StatusCode.CLIENT_IO_ERROR,
          `property '${name}' is required`,
      );
    }
    return value;
  }

  /**
   * @return {Promise<void>}
   * @throws {ClientError}
   */
  async registerCertificate() {
    const builder = new CertificateRegistrationRequestBuilder(
        new this.protobuf.CertificateRegistrationRequest(),
    ).withCertHolderId(this.certHolderId)
        .withCertVersion(this.certVersion)
        .withCertPem(this.certPem);

    const request = await builder.build();
    const promise = new Promise((resolve, reject) => {
      this.ledgerPrivileged.registerCert(
          request,
          this.metadata,
          (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response.toObject());
            }
          },
      );
    });

    return this._executePromise(promise);
  }

  /**
   * @param {number} id of the function
   * @param {string} name of the function
   * @param {Uint8Array} functionBytes of the function
   * @return {Promise<void>}
   * @throws {ClientError}
   */
  async registerFunction(id, name, functionBytes) {
    if (!(functionBytes instanceof Uint8Array)) {
      throw new ClientError(
          StatusCode.CLIENT_IO_ERROR,
          'parameter functionBytes is not a \'Uint8Array\'',
      );
    }

    const builder = new FunctionRegistrationRequestBuilder(
        new this.protobuf.FunctionRegistrationRequest(),
    ).withFunctionId(id)
        .withFunctionBinaryName(name)
        .withFunctionByteCode(functionBytes);

    const request = await builder.build();
    const promise = new Promise((resolve, reject) => {
      this.ledgerPrivileged.registerFunction(
          request,
          this.metadata,
          (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response.toObject());
            }
          },
      );
    });

    return this._executePromise(promise);
  };

  /**
   * @param {number} id of the contract
   * @param {string} name  the canonical name of the contract class.
   *  For example "com.banking.contract1"
   * @param {Uint8Array} contractBytes
   * @param {Object}  [properties]
   *  JSON Object used for setting client properties
   * @return {Promise<void>}
   * @throws {ClientError}
   */
  async registerContract(id, name, contractBytes, properties) {
    if (!(contractBytes instanceof Uint8Array)) {
      throw new ClientError(
          StatusCode.CLIENT_IO_ERROR,
          'parameter contractBytes is not a \'Uint8Array\'',
      );
    }

    const propertiesJson = JSON.stringify(properties);
    const builder = new ContractRegistrationRequestBuilder(
        new this.protobuf.ContractRegistrationRequest(),
        this.signer,
    ).withContractId(id)
        .withContractBinaryName(name)
        .withContractByteCode(contractBytes)
        .withContractProperties(propertiesJson)
        .withCertHolderId(this.certHolderId)
        .withCertVersion(this.certVersion);

    let request;
    try {
      request = await builder.build();
    } catch (e) {
      throw new ClientError(
          StatusCode.RUNTIME_ERROR,
          e.message,
      );
    }

    const promise = new Promise((resolve, reject) => {
      this.ledgerClient.registerContract(
          request,
          this.metadata,
          (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response.toObject());
            }
          },
      );
    });

    return this._executePromise(promise);
  }

  /**
   * List the registered contract for the current user
   * @param {string} [contractId]
   *  to verify if a specific contractId is registered
   * @return {Promise<Object>}
   * @throws {ClientError}
   */
  async listContracts(contractId) {
    const builder = new ContractsListingRequestBuilder(
        new this.protobuf.ContractsListingRequest(),
        this.signer,
    ).withCertHolderId(this.certHolderId)
        .withCertVersion(this.certVersion)
        .withContractId(contractId);

    let request;
    try {
      request = await builder.build();
    } catch (e) {
      throw new ClientError(
          StatusCode.RUNTIME_ERROR,
          e.message,
      );
    }

    const promise = new Promise((resolve, reject) => {
      this.ledgerClient.listContracts(
          request,
          this.metadata,
          (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(JSON.parse(response.toObject().json));
            }
          },
      );
    });

    return this._executePromise(promise);
  }

  /**
   * Validate the integrity of an asset
   * @param {number} [assetId]
   * @return {Promise<LedgerValidationResponse>}
   * @throws {ClientError}
   */
  async validateLedger(assetId) {
    const builder = new LedgerValidationRequestBuilder(
        new this.protobuf.LedgerValidationRequest(),
        this.signer,
    ).withAssetId(assetId)
        .withCertHolderId(this.certHolderId)
        .withCertVersion(this.certVersion);

    let request;
    try {
      request = await builder.build();
    } catch (e) {
      throw new ClientError(
          StatusCode.RUNTIME_ERROR,
          e.message,
      );
    }

    const promise = new Promise((resolve, reject) => {
      this.ledgerClient.validateLedger(
          request,
          this.metadata,
          (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response.toObject());
            }
          },
      );
    });

    return this._executePromise(promise);
  }

  /**
   * @param {number} contractId
   * @param {Object} argument
   * @param {Object} [functionArgument=undefined]
   * @return {Promise<ContractExecutionResponse|void|*>}
   * @throws {ClientError}
   */
  async executeContract(contractId, argument, functionArgument) {
    argument['nonce'] = new Date().getTime().toString();
    const argumentJson = JSON.stringify(argument);
    const functionArgumentJson = JSON.stringify(functionArgument);

    const builder = new ContractExecutionRequestBuilder(
        new this.protobuf.ContractExecutionRequest(),
        this.signer,
    ).withContractId(contractId)
        .withContractArgument(argumentJson)
        .withFunctionArgument(functionArgumentJson)
        .withCertHolderId(this.certHolderId)
        .withCertVersion(this.certVersion);

    let request;
    try {
      request = await builder.build();
    } catch (e) {
      throw new ClientError(
          StatusCode.RUNTIME_ERROR,
          e.message,
      );
    }

    const promise = new Promise((resolve, reject) => {
      this.ledgerClient.executeContract(
          request,
          this.metadata,
          (err, response) => {
            if (err) {
              reject(err);
            } else {
              const jsonResponse = response.toObject();
              jsonResponse.result = JSON.parse(jsonResponse.result);
              resolve(jsonResponse);
            }
          },
      );
    });

    return this._executePromise(promise);
  }

  /**
   * @param {Promise} promise
   * @return {Promise}
   * @throws {ClientError}
   */
  async _executePromise(promise) {
    try {
      return await promise;
    } catch (e) {
      const status = this._parseStatusFromError(e);
      if (status) {
        throw new ClientError(status.code, status.message);
      } else {
        throw new ClientError(
            StatusCode.UNKNOWN_TRANSACTION_STATUS,
            e.message,
        );
      }
    }
  }

  /**
   * Extract the status from the error
   * @param {Error} error
   * @return {Status|void} return a status or undefined if the status cannot be
   * parsed from the error
   * @private
   */
  _parseStatusFromError(error) {
    if (!error.metadata) {
      return;
    }
    let binaryStatus;
    if (this._isNodeJsRuntime()) {
      const statusMetadata = error.metadata.get(
          ClientServiceBase.binaryStatusKey);
      if (Array.isArray(statusMetadata) && statusMetadata.length === 1) {
        binaryStatus = statusMetadata[0];
      }
    } else { // Web runtime
      binaryStatus = error.metadata[ClientServiceBase.binaryStatusKey];
    }
    if (binaryStatus) {
      return this.protobuf.Status.deserializeBinary(binaryStatus).toObject();
    }
  }

  /**
   *
   * @return {boolean} true if the runtime is Node.js
   * @private
   */
  _isNodeJsRuntime() {
    return typeof window === 'undefined';
  }
}

module.exports = {
  ClientServiceBase,
  ClientError,
  StatusCode,
};
