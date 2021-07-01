const path = require('path')
const fs = require('fs')
const PDFDocument = require('pdfkit')
const utils = require('../lib/utils')
const insecurity = require('../lib/insecurity')
const models = require('../models/index')
const products = require('../data/datacache').products
const challenges = require('../data/datacache').challenges
const config = require('config')

module.exports = function placeOrder () {
  return (req, res, next) => {
    const id = req.params.id
    models.Basket.find({ where: { id }, include: [ { model: models.Product, paranoid: false } ] })
      .then(basket => {
        if (basket) {
          const customer = insecurity.authenticatedUsers.from(req)
          const orderNo = insecurity.hash(new Date() + '_' + id)
          const pdfFile = 'order_' + orderNo + '.pdf'
          const doc = new PDFDocument()
          const fileWriter = doc.pipe(fs.createWriteStream(path.join(__dirname, '../ftp/', pdfFile)))

          doc.text(config.get('application.name') + ' - Order Confirmation')
          doc.moveDown()
          doc.moveDown()
          doc.moveDown()
          doc.text('Customer: ' + (customer ? customer.data ? customer.data.email : undefined : undefined))
          doc.moveDown()
          doc.text('Order #: ' + orderNo)
          doc.moveDown()
          doc.moveDown()
          let totalPrice = 0
          basket.Products.forEach(({BasketItem, price, name}) => {
            if (utils.notSolved(challenges.christmasSpecialChallenge) && BasketItem.ProductId === products.christmasSpecial.id) {
              utils.solve(challenges.christmasSpecialChallenge)
            }
            const itemTotal = price * BasketItem.quantity
            doc.text(BasketItem.quantity + 'x ' + name + ' ea. ' + price + ' = ' + itemTotal)
            doc.moveDown()
            totalPrice += itemTotal
          })
          doc.moveDown()
          const discount = insecurity.discountFromCoupon(basket.coupon)
          if (discount) {
            if (utils.notSolved(challenges.forgedCouponChallenge) && discount >= 80) {
              utils.solve(challenges.forgedCouponChallenge)
            }
            const discountAmount = (totalPrice * (discount / 100)).toFixed(2)
            doc.text(discount + '% discount from coupon: -' + discountAmount)
            doc.moveDown()
            totalPrice -= discountAmount
          }
          doc.text('Total Price: ' + totalPrice)
          doc.moveDown()
          doc.moveDown()
          doc.text('Thank you for your order!')
          doc.end()

          if (utils.notSolved(challenges.negativeOrderChallenge) && totalPrice < 0) {
            utils.solve(challenges.negativeOrderChallenge)
          }

          fileWriter.on('finish', () => {
            basket.updateAttributes({ coupon: null })
            models.BasketItem.destroy({ where: { BasketId: id } })
            res.json({ orderConfirmation: '/ftp/' + pdfFile })
          })
        } else {
          next(new Error('Basket with id=' + id + ' does not exist.'))
        }
      }).catch(error => {
        next(error)
      })
  }
}
