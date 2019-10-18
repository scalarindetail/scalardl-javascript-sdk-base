const {SignatureSigner, JsrsasignSignatureSigner} = require('../signer.js');
const expect = require('chai').expect;
const assert = require('chai').assert;
const jsrsasign = require('jsrsasign');
const sinon = require('sinon');
const fs = require('fs');

describe('Class SignatureSigner', () => {
  afterEach(function() {
    sinon.restore();
  });

  describe('Class JsrsasignSignatureSigner', () => {
    // Mock the ArrayBuffertoHex in signer class
    beforeEach(function() {
      sinon.replace(jsrsasign, 'ArrayBuffertohex',
          sinon.fake.returns('hex-value'));
    });

    it('throws exception when pem file is not correct', () => {
      const signer = new JsrsasignSignatureSigner('incorrect pem');
      expect(() => {
        signer.sign('content');
      }).to.throw('Failed to load private key');
    });

    it('throws exception when it not is ASN.1 hex string', () => {
      const signer = new JsrsasignSignatureSigner('mocked non ASN.1 string');
      expect(() => {
        signer.sign('content');
      }).to.throw('Failed to load private key not ASN.1 hex string');
    });

    it('should work properly', () => {
      const mockedECDSA = {
        readPKCS5PrvKeyHex: function() {},
      };
      const mockedSignature = {
        init: function() {},
        updateHex: function() {},
        sign: function() {},
      };
      const pem = fs.readFileSync(__dirname + '/key.pem', 'utf-8');
      sinon.replace(jsrsasign.KJUR.crypto, 'ECDSA',
          sinon.fake.returns(mockedECDSA));
      sinon.replace(jsrsasign, 'hextoArrayBuffer',
          sinon.fake.returns([1, 2, 3]));
      sinon.replace(jsrsasign.KJUR.crypto, 'Signature',
          sinon.fake.returns(mockedSignature));
      const signer = new JsrsasignSignatureSigner(pem);
      const mockSpyECDSA = sinon.spy(mockedECDSA, 'readPKCS5PrvKeyHex');
      const mockSpySignatureInit = sinon.spy(mockedSignature, 'init');
      const mockSpySignatureUpdateHex = sinon.spy(mockedSignature, 'updateHex');
      const mockSpySignatureSign = sinon.spy(mockedSignature, 'sign');
      signer.sign('content');
      assert(mockSpySignatureInit.calledOnce);
      assert(mockSpySignatureUpdateHex.withArgs('hex-value').calledOnce);
      assert(mockSpySignatureSign.calledOnce);
      assert(mockSpyECDSA.calledOnce);
    });
  });

  describe('Class EllipticSignatureSigner', () => {
    it('throws exception when pem file is not correct', () => {
      const signer = new SignatureSigner('incorrect pem'); // EllipticSignature is used by default
      expect(() => {
        signer.sign('content');
      }).
          to.
          throw(
              'Failed to sign the request unsupported PKCS#1/5 hexadecimal key');
    });
    it('should work properly', () => {
      const pem = fs.readFileSync(__dirname + '/key.pem', 'utf-8');
      const signer = new SignatureSigner(pem);
      assert.instanceOf(signer.sign('Content'), Uint8Array);
    });
  });

});
