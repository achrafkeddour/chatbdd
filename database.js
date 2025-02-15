const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '127.0.0.1',       // adjust if necessary
  user: 'root',            // your MySQL username
  password: '0000', // your MySQL password
  database: 'chatdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;




//important : i should take in consideration if i turned to postgresql i will change some content in this page 
// also i will change some lines in other pages 

//example 
//MySQL Query:
//await pool.query('INSERT INTO users (name, username, password, dob, sexe) VALUES (?, ?, ?, ?, ?)', [name, username, password, dob, sexe]);

//PostgreSQL Query:
//await pool.query('INSERT INTO users (name, username, password, dob, sexe) VALUES ($1, $2, $3, $4, $5)', [name, username, password, dob, sexe]);
