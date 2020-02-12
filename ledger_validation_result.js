const {AssetProof} = require('./asset_proof');

/**
 * To handle LedgerValidationResponse
 */
class LedgerValidationResult {
  /**
   * @param {StatusCode} code
   * @param {AssetProof} proof
   */
  constructor(code, proof) {
    this.code = code;
    this.proof = proof;
  }

  /**
   * @param {LedgerValidationResponse} response
   * @return {LedgerValidationResult}
   */
  static fromGrpcLedgerValidationResponse(response) {
    return new LedgerValidationResult(
        response.getStatusCode(),
        AssetProof.fromGrpcAssetProof(response.getProof()),
    );
  }

  /**
   * @return {AssetProof}
   */
  getProof() {
    return this.proof;
  }

  /**
   * @return {StatusCode}
   */
  getCode() {
    return this.code;
  }
}

module.exports = {
  LedgerValidationResult,
};
